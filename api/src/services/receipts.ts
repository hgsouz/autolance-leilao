import type { Knex } from 'knex'
import { receiptSeal } from '../lib/crypto'
import { notFound } from '../lib/errors'
import type { LotRow, ReceiptRow } from '../types'
import { auditLot } from './audit'

export async function getReceipt(db: Knex, code: string) {
  const receipt = (await db('receipts').where({ code }).first()) as ReceiptRow | undefined
  if (!receipt) throw notFound('Comprovante')
  const lot = (await db('lots').where({ id: receipt.lot_id }).first()) as LotRow

  const sealOk =
    receiptSeal({
      code: receipt.code,
      lotId: receipt.lot_id,
      winnerAlias: receipt.winner_alias,
      auctioneerAlias: receipt.auctioneer_alias,
      amountCents: receipt.amount_cents,
      bidCount: receipt.bid_count,
      headHash: receipt.head_hash,
      issuedAt: receipt.issued_at,
    }) === receipt.seal

  const audit = await auditLot(db, receipt.lot_id)

  return {
    code: receipt.code,
    lotId: receipt.lot_id,
    title: receipt.title,
    imageUrl: lot.image_url,
    attributes: lot.attributes,
    amountCents: receipt.amount_cents,
    winnerAlias: receipt.winner_alias,
    auctioneerAlias: receipt.auctioneer_alias,
    bidCount: receipt.bid_count,
    headHash: receipt.head_hash,
    issuedAt: receipt.issued_at.toISOString(),
    valid: sealOk && audit.integrity.ok,
    sealOk,
    auditOk: audit.integrity.ok,
  }
}
