import type { Knex } from 'knex'
import { emitLot } from '../lib/bus'
import { dbNow } from '../lib/clock'
import { auctioneerAlias, bidderAlias, lotSeal } from '../lib/crypto'
import { AppError, forbidden, notFound } from '../lib/errors'
import { brl } from '../lib/money'
import type { BidRow, LotRow, Viewer } from '../types'
import { minNextBid } from './bids'
import { getVehicle } from './catalog'

export type Phase = 'scheduled' | 'live' | 'ended' | 'canceled'

export type LotRowX = LotRow & { receipt_code: string | null; viewer_has_bid?: boolean }

export function phaseOf(lot: Pick<LotRow, 'status' | 'starts_at' | 'ends_at'>, now: Date): Phase {
  if (lot.status === 'canceled') return 'canceled'
  if (lot.status === 'settled') return 'ended'
  if (now.getTime() < lot.starts_at.getTime()) return 'scheduled'
  if (now.getTime() < lot.ends_at.getTime()) return 'live'
  return 'ended'
}

export function toLotDto(lot: LotRowX, now: Date, viewer?: Viewer | null) {
  const phase = phaseOf(lot, now)
  const isOwner = !!viewer && viewer.id === lot.auctioneer_id
  const isWinner = !!viewer && lot.winner_id === viewer.id
  const settled = lot.status === 'settled'

  return {
    id: lot.id,
    title: lot.title,
    description: lot.description,
    imageUrl: lot.image_url,
    attributes: lot.attributes,
    phase,
    startsAt: lot.starts_at.toISOString(),
    endsAt: lot.ends_at.toISOString(),
    serverTime: now.toISOString(),
    startingBidCents: lot.starting_bid_cents,
    minIncrementCents: lot.min_increment_cents,
    currentBidCents: lot.current_bid_cents,
    bidCount: lot.bid_count,
    minNextBidCents: minNextBid(lot),
    leaderAlias: lot.leader_id ? bidderAlias(lot.id, lot.leader_id) : null,
    auctioneerAlias: auctioneerAlias(lot.auctioneer_id),
    outcome:
      phase === 'ended'
        ? {
            settled,
            sold: settled ? lot.winner_id !== null : lot.leader_id !== null,
            winningBidCents: settled ? lot.winning_bid_cents : lot.current_bid_cents,
            winnerAlias: lot.leader_id ? bidderAlias(lot.id, lot.leader_id) : null,
          }
        : null,
    me: viewer
      ? {
          role: viewer.role,
          isOwner,
          alias: viewer.role === 'bidder' ? bidderAlias(lot.id, viewer.id) : null,
          hasBid: !!lot.viewer_has_bid,
          isLeading: lot.status === 'open' && lot.leader_id === viewer.id,
          isWinner,
          // O código do comprovante só é revelado ao vencedor e ao leiloeiro do lote.
          receiptCode: (isWinner || isOwner) && lot.receipt_code ? lot.receipt_code : null,
        }
      : null,
  }
}

function baseQuery(db: Knex, viewerId?: string) {
  const q = db('lots')
    .leftJoin('receipts', 'receipts.lot_id', 'lots.id')
    .select('lots.*', 'receipts.code as receipt_code')
  if (viewerId) {
    q.select(
      db.raw('exists(select 1 from bids b where b.lot_id = lots.id and b.bidder_id = ?) as viewer_has_bid', [viewerId]),
    )
  }
  return q
}

export interface LotFilters {
  phase?: 'live' | 'scheduled' | 'ended'
  q?: string
  brand?: string
  fuel?: string
  minPriceCents?: number
  maxPriceCents?: number
  sort?: 'ending' | 'newest' | 'price_asc' | 'price_desc'
  limit?: number
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listLots(db: Knex, f: LotFilters, viewer?: Viewer | null) {
  const now = await dbNow(db)
  const qb = baseQuery(db, viewer?.id).whereNot('lots.status', 'canceled')

  if (f.phase === 'live') {
    qb.where('lots.status', 'open').where('lots.starts_at', '<=', now).where('lots.ends_at', '>', now)
  } else if (f.phase === 'scheduled') {
    qb.where('lots.status', 'open').where('lots.starts_at', '>', now)
  } else if (f.phase === 'ended') {
    qb.where((w) =>
      w.where('lots.status', 'settled').orWhere((x) => x.where('lots.status', 'open').where('lots.ends_at', '<=', now)),
    )
  }

  if (f.q) {
    const like = `%${escapeLike(f.q)}%`
    qb.whereRaw(
      `(lots.title ilike ? or lots.attributes->>'brand' ilike ? or lots.attributes->>'model' ilike ?)`,
      [like, like, like],
    )
  }
  if (f.brand) qb.whereRaw(`lots.attributes->>'brand' ilike ?`, [escapeLike(f.brand)])
  if (f.fuel) qb.whereRaw(`lots.attributes->>'fuel' ilike ?`, [escapeLike(f.fuel)])
  if (f.minPriceCents !== undefined) {
    qb.whereRaw('coalesce(lots.current_bid_cents, lots.starting_bid_cents) >= ?', [f.minPriceCents])
  }
  if (f.maxPriceCents !== undefined) {
    qb.whereRaw('coalesce(lots.current_bid_cents, lots.starting_bid_cents) <= ?', [f.maxPriceCents])
  }

  switch (f.sort) {
    case 'newest':
      qb.orderBy('lots.created_at', 'desc')
      break
    case 'price_asc':
      qb.orderByRaw('coalesce(lots.current_bid_cents, lots.starting_bid_cents) asc')
      break
    case 'price_desc':
      qb.orderByRaw('coalesce(lots.current_bid_cents, lots.starting_bid_cents) desc')
      break
    case 'ending':
      qb.orderBy('lots.ends_at', 'asc')
      break
    default:
      if (f.phase === 'ended') qb.orderBy('lots.ends_at', 'desc')
      else if (f.phase === 'scheduled') qb.orderBy('lots.starts_at', 'asc')
      else qb.orderBy('lots.ends_at', 'asc')
  }

  const rows = (await qb.limit(f.limit ?? 100)) as LotRowX[]
  return { serverTime: now.toISOString(), items: rows.map((r) => toLotDto(r, now, viewer)) }
}

export async function lotFacets(db: Knex) {
  const rows = await db('lots')
    .whereNot('status', 'canceled')
    .select(db.raw(`distinct lots.attributes->>'brand' as brand, lots.attributes->>'fuel' as fuel`))
  const brands = [...new Set(rows.map((r) => r.brand).filter(Boolean))].sort()
  const fuels = [...new Set(rows.map((r) => r.fuel).filter(Boolean))].sort()
  return { brands, fuels }
}

export async function getLot(db: Knex, id: string, viewer?: Viewer | null) {
  const now = await dbNow(db)
  const row = (await baseQuery(db, viewer?.id).where('lots.id', id).first()) as LotRowX | undefined
  if (!row) throw notFound('Lote')
  return toLotDto(row, now, viewer)
}

export async function listBids(db: Knex, lotId: string, viewer?: Viewer | null) {
  const lot = await db('lots').where({ id: lotId }).first('id')
  if (!lot) throw notFound('Lote')
  const rows = (await db('bids').where({ lot_id: lotId }).orderBy('seq', 'desc').limit(200)) as BidRow[]
  return {
    items: rows.map((b) => ({
      seq: b.seq,
      alias: bidderAlias(lotId, b.bidder_id),
      amountCents: b.amount_cents,
      placedAt: b.placed_at.toISOString(),
      mine: !!viewer && viewer.id === b.bidder_id,
    })),
  }
}

export interface CreateLotInput {
  brandCode: string
  modelCode: string
  yearCode: string
  title?: string
  description?: string
  imageUrl?: string | null
  startingBidCents: number
  minIncrementCents: number
  startsAt: Date
  endsAt: Date
}

export async function createLot(db: Knex, auctioneerId: string, input: CreateLotInput) {
  const now = await dbNow(db)
  const startsAt = input.startsAt
  const endsAt = input.endsAt

  if (endsAt.getTime() <= now.getTime()) {
    throw new AppError(422, 'INVALID_SCHEDULE', 'O horário de término precisa estar no futuro.')
  }
  if (endsAt.getTime() - startsAt.getTime() < 60_000) {
    throw new AppError(422, 'INVALID_SCHEDULE', 'O lote precisa durar pelo menos 1 minuto.')
  }
  if (endsAt.getTime() - startsAt.getTime() > 60 * 24 * 3600 * 1000) {
    throw new AppError(422, 'INVALID_SCHEDULE', 'A duração máxima de um lote é de 60 dias.')
  }

  // O item vem sempre da API pública (ou do cache/catálogo de amostra), nunca do corpo da requisição.
  const { vehicle } = await getVehicle(db, input.brandCode, input.modelCode, input.yearCode)
  const attributes = {
    brand: vehicle.brand,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    fuel: vehicle.fuel,
    codeFipe: vehicle.codeFipe,
    fipePriceCents: vehicle.fipePriceCents,
    referenceMonth: vehicle.referenceMonth,
    source: vehicle.source,
  }
  const title = input.title?.trim() || `${vehicle.brand} ${vehicle.model} ${vehicle.modelYear}`

  const id = await insertLot(db, {
    auctioneerId,
    title,
    description: input.description,
    imageUrl: input.imageUrl,
    attributes,
    startingBidCents: input.startingBidCents,
    minIncrementCents: input.minIncrementCents,
    startsAt,
    endsAt,
  })
  emitLot(id, 'created')
  return id
}

/** Insere o lote já com o selo inicial (0 lances). Sem validação de agenda: use `createLot`. */
export async function insertLot(
  db: Knex,
  l: {
    auctioneerId: string
    title: string
    description?: string | null
    imageUrl?: string | null
    attributes: LotRow['attributes']
    startingBidCents: number
    minIncrementCents: number
    startsAt: Date
    endsAt: Date
  },
): Promise<string> {
  return db.transaction(async (trx) => {
    const [inserted] = (await trx('lots')
      .insert({
        auctioneer_id: l.auctioneerId,
        title: l.title,
        description: l.description?.trim() || null,
        image_url: l.imageUrl?.trim() || null,
        attributes: JSON.stringify(l.attributes),
        starting_bid_cents: l.startingBidCents,
        min_increment_cents: l.minIncrementCents,
        starts_at: l.startsAt,
        original_ends_at: l.endsAt,
        ends_at: l.endsAt,
        head_seal: 'pending',
      })
      .returning('*')) as LotRow[]
    const lot = inserted!
    await trx('lots')
      .where({ id: lot.id })
      .update({
        head_seal: lotSeal({
          id: lot.id,
          starting_bid_cents: l.startingBidCents,
          min_increment_cents: l.minIncrementCents,
          bid_count: 0,
          head_hash: null,
          current_bid_cents: null,
          leader_id: null,
        }),
      })
    return lot.id
  })
}

export async function cancelLot(db: Knex, auctioneerId: string, lotId: string, opts: { refund: boolean }) {
  const result = await db.transaction(async (trx) => {
    const lot = (await trx('lots').where({ id: lotId }).forUpdate().first()) as LotRow | undefined
    if (!lot) throw notFound('Lote')
    if (lot.auctioneer_id !== auctioneerId) throw forbidden('Você só pode cancelar os seus próprios lotes.')
    if (lot.status === 'canceled') throw new AppError(409, 'LOT_CANCELED', 'Este lote já foi cancelado.')

    const now = await dbNow(trx)
    if (lot.status === 'settled' || now.getTime() >= lot.ends_at.getTime()) {
      throw new AppError(409, 'LOT_ENDED', 'Este lote já foi encerrado e não pode mais ser cancelado.')
    }
    if (lot.bid_count > 0 && !opts.refund) {
      throw new AppError(
        409,
        'LOT_HAS_BIDS',
        'Este lote já recebeu lances. Para cancelar, confirme o cancelamento com estorno automático ao licitante líder.',
        { bidCount: lot.bid_count },
      )
    }

    // Estorno automático: o valor do líder só estava "comprometido" (nunca foi debitado).
    // Ao mudar o status para `canceled` ele deixa de ser contado e volta ao saldo disponível.
    if (lot.leader_id && lot.current_bid_cents) {
      await trx('wallet_transactions').insert({
        user_id: lot.leader_id,
        type: 'release',
        amount_cents: 0,
        lot_id: lot.id,
        note: `Lote cancelado pelo leiloeiro: ${brl(lot.current_bid_cents)} liberados (${lot.title})`,
      })
    }
    await trx('lots').where({ id: lot.id }).update({ status: 'canceled', canceled_at: now })
    return { refundedCents: lot.current_bid_cents ?? 0 }
  })
  emitLot(lotId, 'canceled')
  return result
}

export async function auctioneerLots(db: Knex, auctioneerId: string) {
  const now = await dbNow(db)
  const rows = (await baseQuery(db).where('lots.auctioneer_id', auctioneerId).orderBy('lots.created_at', 'desc')) as LotRowX[]
  const viewer: Viewer = { id: auctioneerId, role: 'auctioneer' }
  const items = rows.map((r) => toLotDto(r, now, viewer))

  const totals = {
    receivedCents: rows.reduce((sum, r) => sum + (r.status === 'settled' ? (r.winning_bid_cents ?? 0) : 0), 0),
    soldCount: rows.filter((r) => r.status === 'settled' && r.winner_id).length,
    unsoldCount: rows.filter((r) => r.status === 'settled' && !r.winner_id).length,
    liveCount: items.filter((i) => i.phase === 'live').length,
    scheduledCount: items.filter((i) => i.phase === 'scheduled').length,
    canceledCount: items.filter((i) => i.phase === 'canceled').length,
  }
  return { serverTime: now.toISOString(), items, totals }
}

export type MyBidState = 'leading' | 'outbid' | 'won' | 'lost' | 'canceled'

export async function bidderBids(db: Knex, userId: string) {
  const now = await dbNow(db)
  const viewer: Viewer = { id: userId, role: 'bidder' }
  const rows = (await baseQuery(db, userId)
    .whereIn('lots.id', db('bids').where({ bidder_id: userId }).select('lot_id'))
    .orderBy('lots.ends_at', 'desc')) as LotRowX[]

  const mine = (await db('bids')
    .where({ bidder_id: userId })
    .groupBy('lot_id')
    .select('lot_id')
    .max({ max: 'amount_cents' })) as { lot_id: string; max: number | string }[]
  const myMax = new Map<string, number>(mine.map((m) => [m.lot_id, Number(m.max)]))

  const items = rows.map((r) => {
    let state: MyBidState
    if (r.status === 'canceled') state = 'canceled'
    else if (r.status === 'settled') state = r.winner_id === userId ? 'won' : 'lost'
    else state = r.leader_id === userId ? 'leading' : 'outbid'
    return {
      state,
      myHighestBidCents: myMax.get(r.id) ?? 0,
      lot: toLotDto(r, now, viewer),
    }
  })
  return { serverTime: now.toISOString(), items }
}
