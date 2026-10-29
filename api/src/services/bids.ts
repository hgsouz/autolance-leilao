import type { Db } from '../db/knex'
import type { Knex } from 'knex'
import { env } from '../env'
import { emitLot } from '../lib/bus'
import { dbNow } from '../lib/clock'
import { AppError, notFound } from '../lib/errors'
import { brl } from '../lib/money'
import type { LotRow, UserRow } from '../types'
import { appendBid } from './chain'

export const minNextBid = (lot: Pick<LotRow, 'bid_count' | 'current_bid_cents' | 'starting_bid_cents' | 'min_increment_cents'>) =>
  lot.bid_count === 0 || lot.current_bid_cents === null
    ? lot.starting_bid_cents
    : lot.current_bid_cents + lot.min_increment_cents

/** Soma dos lances vencentes do usuário em lotes ainda não liquidados (saldo comprometido). */
export async function committedCents(db: Db, userId: string): Promise<number> {
  const row = await db('lots')
    .where({ leader_id: userId, status: 'open' })
    .sum({ total: 'current_bid_cents' })
    .first()
  return Number(row?.total ?? 0)
}

export interface PlaceBidResult {
  bid: { seq: number; amountCents: number; placedAt: string }
  extended: boolean
  endsAt: string
  currentBidCents: number
  minNextBidCents: number
}

export async function placeBid(
  db: Knex,
  args: { lotId: string; userId: string; amountCents: number },
): Promise<PlaceBidResult> {
  const result = await db.transaction(async (trx) => {
    // Ordem de travas: lote -> usuário (a mesma em toda a aplicação, evita deadlock).
    const lot = (await trx('lots').where({ id: args.lotId }).forUpdate().first()) as LotRow | undefined
    if (!lot) throw notFound('Lote')

    const user = (await trx('users').where({ id: args.userId }).forUpdate().first()) as UserRow | undefined
    if (!user) throw notFound('Usuário')
    if (user.role !== 'bidder') {
      throw new AppError(403, 'AUCTIONEER_CANNOT_BID', 'O leiloeiro não pode dar lances.')
    }

    const now = await dbNow(trx)

    if (lot.status === 'canceled') {
      throw new AppError(409, 'LOT_CANCELED', 'Este lote foi cancelado.')
    }
    if (now.getTime() < lot.starts_at.getTime()) {
      throw new AppError(409, 'LOT_NOT_STARTED', 'Este lote ainda não foi iniciado. Aguarde a abertura dos lances.', {
        startsAt: lot.starts_at.toISOString(),
      })
    }
    if (lot.status === 'settled' || now.getTime() >= lot.ends_at.getTime()) {
      throw new AppError(409, 'LOT_ENDED', 'Este lote já foi encerrado.')
    }
    if (lot.leader_id === user.id) {
      throw new AppError(
        409,
        'ALREADY_LEADING',
        'Você já está ganhando este lote. Aguarde ser superado para dar um novo lance.',
      )
    }

    const minimum = minNextBid(lot)
    if (args.amountCents < minimum) {
      throw new AppError(
        422,
        'BELOW_MINIMUM',
        lot.bid_count === 0
          ? `Lance abaixo do mínimo. O primeiro lance deve ser de pelo menos ${brl(minimum)}.`
          : `Lance abaixo do mínimo. O próximo lance deve ser de pelo menos ${brl(minimum)} (lance atual + incremento).`,
        { minimumCents: minimum },
      )
    }

    // Saldo disponível = total - comprometido (lances vencentes em outros lotes abertos).
    const committed = await committedCents(trx, user.id)
    const available = user.balance_cents - committed
    if (args.amountCents > available) {
      throw new AppError(
        422,
        'INSUFFICIENT_BALANCE',
        `Saldo insuficiente. Disponível: ${brl(available)}; lance: ${brl(args.amountCents)}. Faça um depósito na sua carteira.`,
        { availableCents: available, requiredCents: args.amountCents },
      )
    }

    const { bid, lot: updated } = await appendBid(trx, lot, user.id, args.amountCents, now)

    // Anti-sniping: lance aceito na janela final reinicia o relógio para now + extensão.
    let endsAt = lot.ends_at
    let extended = false
    const remainingMs = lot.ends_at.getTime() - now.getTime()
    if (remainingMs <= env.SNIPING_WINDOW_SECONDS * 1000) {
      endsAt = new Date(now.getTime() + env.SNIPING_EXTENSION_SECONDS * 1000)
      if (endsAt.getTime() > lot.ends_at.getTime()) {
        await trx('lots').where({ id: lot.id }).update({ ends_at: endsAt })
        extended = true
      } else {
        endsAt = lot.ends_at
      }
    }

    return {
      bid: { seq: bid.seq, amountCents: bid.amount_cents, placedAt: bid.placed_at.toISOString() },
      extended,
      endsAt: endsAt.toISOString(),
      currentBidCents: updated.current_bid_cents!,
      minNextBidCents: minNextBid(updated),
      lotId: lot.id,
    }
  })

  emitLot(result.lotId, result.extended ? 'extended' : 'bid')
  const { lotId: _lotId, ...rest } = result
  return rest
}
