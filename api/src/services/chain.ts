import type { Knex } from 'knex'
import { bidHash, genesisHash, lotSeal } from '../lib/crypto'
import type { BidRow, LotRow } from '../types'

/**
 * Acrescenta um lance à cadeia do lote e atualiza o estado denormalizado + selo.
 * Precisa ser chamado dentro de uma transação, com a linha do lote já travada (FOR UPDATE).
 * NÃO valida regras de negócio: quem chama é responsável por isso.
 */
export async function appendBid(
  trx: Knex.Transaction,
  lot: LotRow,
  bidderId: string,
  amountCents: number,
  placedAt: Date,
): Promise<{ bid: BidRow; lot: LotRow }> {
  const seq = lot.bid_count + 1
  const prevHash = lot.head_hash ?? genesisHash(lot.id)
  const hash = bidHash({ prevHash, lotId: lot.id, seq, bidderId, amountCents, placedAt })

  const [bid] = (await trx('bids')
    .insert({
      lot_id: lot.id,
      bidder_id: bidderId,
      seq,
      amount_cents: amountCents,
      placed_at: placedAt,
      prev_hash: prevHash,
      hash,
    })
    .returning('*')) as BidRow[]

  const next: LotRow = {
    ...lot,
    bid_count: seq,
    head_hash: hash,
    current_bid_cents: amountCents,
    leader_id: bidderId,
  }
  const head_seal = lotSeal(next)
  await trx('lots')
    .where({ id: lot.id })
    .update({
      bid_count: seq,
      head_hash: hash,
      current_bid_cents: amountCents,
      leader_id: bidderId,
      head_seal,
    })

  return { bid: bid!, lot: { ...next, head_seal } }
}
