import type { Knex } from 'knex'
import { emitLot } from '../lib/bus'
import { dbNow } from '../lib/clock'
import { auctioneerAlias, bidderAlias, newReceiptCode, receiptSeal } from '../lib/crypto'
import type { LotRow, UserRow } from '../types'

/**
 * Liquida um lote encerrado: debita o vencedor, credita o leiloeiro e emite o comprovante.
 * Idempotente: só age se o lote estiver `open` e já tiver passado do horário de fim.
 */
export async function settleLot(db: Knex, lotId: string): Promise<'sold' | 'unsold' | null> {
  const outcome = await db.transaction(async (trx) => {
    const lot = (await trx('lots').where({ id: lotId }).forUpdate().first()) as LotRow | undefined
    if (!lot || lot.status !== 'open') return null

    const now = await dbNow(trx)
    if (lot.ends_at.getTime() > now.getTime()) return null

    if (!lot.leader_id || lot.current_bid_cents === null) {
      await trx('lots').where({ id: lot.id }).update({ status: 'settled', settled_at: now })
      return 'unsold' as const
    }

    const amount = lot.current_bid_cents
    const ids = [lot.leader_id, lot.auctioneer_id].sort()
    const users = (await trx('users').whereIn('id', ids).orderBy('id').forUpdate()) as UserRow[]
    const winner = users.find((u) => u.id === lot.leader_id)!

    if (winner.balance_cents < amount) {
      // Não deve acontecer: o lance só é aceito se couber no saldo disponível.
      throw new Error(`Invariante violada: saldo do vencedor (${winner.balance_cents}) < lance (${amount})`)
    }

    await trx('users').where({ id: lot.leader_id }).decrement('balance_cents', amount)
    await trx('users').where({ id: lot.auctioneer_id }).increment('balance_cents', amount)
    await trx('wallet_transactions').insert([
      { user_id: lot.leader_id, type: 'purchase', amount_cents: -amount, lot_id: lot.id, note: `Arremate: ${lot.title}` },
      { user_id: lot.auctioneer_id, type: 'sale', amount_cents: amount, lot_id: lot.id, note: `Venda: ${lot.title}` },
    ])

    const code = newReceiptCode()
    const winnerAlias = bidderAlias(lot.id, lot.leader_id)
    const sellerAlias = auctioneerAlias(lot.auctioneer_id)
    const seal = receiptSeal({
      code,
      lotId: lot.id,
      winnerAlias,
      auctioneerAlias: sellerAlias,
      amountCents: amount,
      bidCount: lot.bid_count,
      headHash: lot.head_hash!,
      issuedAt: now,
    })
    await trx('receipts').insert({
      code,
      lot_id: lot.id,
      title: lot.title,
      winner_alias: winnerAlias,
      auctioneer_alias: sellerAlias,
      amount_cents: amount,
      bid_count: lot.bid_count,
      head_hash: lot.head_hash,
      issued_at: now,
      seal,
    })

    await trx('lots').where({ id: lot.id }).update({
      status: 'settled',
      winner_id: lot.leader_id,
      winning_bid_cents: amount,
      settled_at: now,
    })
    return 'sold' as const
  })

  if (outcome) emitLot(lotId, 'settled')
  return outcome
}

/** Liquida todos os lotes vencidos. Chamado pelo worker a cada segundo (e pelos testes). */
export async function settleDueLots(db: Knex, limit = 50): Promise<number> {
  const now = await dbNow(db)
  const due = await db('lots')
    .where({ status: 'open' })
    .where('ends_at', '<=', now)
    .orderBy('ends_at', 'asc')
    .limit(limit)
    .select('id')

  let settled = 0
  for (const { id } of due) {
    try {
      if (await settleLot(db, id)) settled++
    } catch (err) {
      console.error(`[settlement] falha ao liquidar lote ${id}`, err)
    }
  }
  return settled
}

export function startSettlementLoop(db: Knex, everyMs: number) {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await settleDueLots(db)
    } catch (err) {
      console.error('[settlement] erro no ciclo', err)
    } finally {
      running = false
    }
  }, everyMs)
  timer.unref()
  return () => clearInterval(timer)
}
