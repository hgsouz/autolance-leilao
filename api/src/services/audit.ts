import type { Knex } from 'knex'
import { bidderAlias, bidHash, genesisHash, lotSeal, receiptSeal } from '../lib/crypto'
import { notFound } from '../lib/errors'
import type { BidRow, LotRow, ReceiptRow } from '../types'

export interface AuditIssue {
  check: string
  code: string
  message: string
  seq?: number
}

export interface AuditCheck {
  id: string
  label: string
  ok: boolean
}

export interface AuditResult {
  lotId: string
  title: string
  status: LotRow['status']
  checkedAt: string
  integrity: { ok: boolean; issues: AuditIssue[] }
  checks: AuditCheck[]
  bidCount: number
  headHash: string | null
  bids: {
    seq: number
    alias: string
    amountCents: number
    placedAt: string
    hash: string
    prevHash: string
  }[]
}

const CHECKS: { id: string; label: string }[] = [
  { id: 'sequence', label: 'Sequência de lances contínua (sem lances removidos ou inseridos)' },
  { id: 'chain', label: 'Cadeia de hashes (HMAC) íntegra em todos os lances' },
  { id: 'rules', label: 'Regras de lance respeitadas (mínimo, incremento, líder não cobre a si mesmo)' },
  { id: 'lot_seal', label: 'Estado do lote confere com o histórico e com o selo do servidor' },
  { id: 'settlement', label: 'Liquidação e comprovante consistentes com o último lance' },
]

/**
 * Recalcula toda a cadeia do lote a partir do zero e compara com o que está no banco.
 * Como o HMAC usa um segredo que só o servidor conhece, quem edita o banco diretamente
 * não consegue "consertar" os hashes depois de alterar, remover ou inserir um lance.
 */
export async function auditLot(db: Knex, lotId: string): Promise<AuditResult> {
  const lot = (await db('lots').where({ id: lotId }).first()) as LotRow | undefined
  if (!lot) throw notFound('Lote')
  const bids = (await db('bids').where({ lot_id: lotId }).orderBy('seq', 'asc')) as BidRow[]

  const issues: AuditIssue[] = []
  const perCheck = new Map<string, number>()
  const fail = (check: string, code: string, message: string, seq?: number) => {
    const n = perCheck.get(check) ?? 0
    perCheck.set(check, n + 1)
    if (n < 5) issues.push({ check, code, message, seq })
  }

  // 1) Sequência contínua 1..n
  bids.forEach((b, i) => {
    if (b.seq !== i + 1) {
      fail('sequence', 'SEQUENCE_GAP', `Sequência interrompida: esperado o lance #${i + 1}, encontrado #${b.seq}.`, b.seq)
    }
  })

  // 2) Cadeia de hashes
  let expectedPrev = genesisHash(lot.id)
  for (const b of bids) {
    if (b.prev_hash !== expectedPrev) {
      fail('chain', 'CHAIN_BROKEN', `O lance #${b.seq} não encadeia com o anterior (lance removido ou inserido).`, b.seq)
    }
    const recomputed = bidHash({
      prevHash: b.prev_hash,
      lotId: b.lot_id,
      seq: b.seq,
      bidderId: b.bidder_id,
      amountCents: b.amount_cents,
      placedAt: b.placed_at,
    })
    if (recomputed !== b.hash) {
      fail('chain', 'HASH_MISMATCH', `O conteúdo do lance #${b.seq} foi alterado (hash não confere).`, b.seq)
    }
    expectedPrev = b.hash
  }

  // 3) Replay das regras de lance
  let lastAmount: number | null = null
  let lastBidder: string | null = null
  let lastTime: number | null = null
  for (const b of bids) {
    const minimum = lastAmount === null ? lot.starting_bid_cents : lastAmount + lot.min_increment_cents
    if (b.amount_cents < minimum) {
      fail('rules', 'BELOW_MINIMUM', `O lance #${b.seq} está abaixo do mínimo permitido na época.`, b.seq)
    }
    if (lastBidder === b.bidder_id) {
      fail('rules', 'SELF_OUTBID', `O lance #${b.seq} foi dado pelo próprio líder.`, b.seq)
    }
    if (lastTime !== null && b.placed_at.getTime() < lastTime) {
      fail('rules', 'TIME_REGRESSION', `O lance #${b.seq} tem horário anterior ao lance anterior.`, b.seq)
    }
    if (b.placed_at.getTime() < lot.starts_at.getTime()) {
      fail('rules', 'BEFORE_START', `O lance #${b.seq} foi registrado antes do início do lote.`, b.seq)
    }
    lastAmount = b.amount_cents
    lastBidder = b.bidder_id
    lastTime = b.placed_at.getTime()
  }

  // 4) Estado do lote x histórico x selo
  const last = bids[bids.length - 1]
  const expectedState = {
    bid_count: bids.length,
    head_hash: last?.hash ?? null,
    current_bid_cents: last?.amount_cents ?? null,
    leader_id: last?.bidder_id ?? null,
  }
  if (
    lot.bid_count !== expectedState.bid_count ||
    lot.head_hash !== expectedState.head_hash ||
    lot.current_bid_cents !== expectedState.current_bid_cents ||
    lot.leader_id !== expectedState.leader_id
  ) {
    fail(
      'lot_seal',
      'LOT_STATE_MISMATCH',
      `O resumo do lote (${lot.bid_count} lances) não confere com o histórico (${bids.length} lances).`,
    )
  }
  if (lotSeal(lot) !== lot.head_seal) {
    fail('lot_seal', 'SEAL_INVALID', 'O selo do lote não confere: o estado do lote foi alterado fora da aplicação.')
  }

  // 5) Liquidação / comprovante
  if (lot.status === 'settled') {
    if (!lot.winner_id) {
      if (bids.length > 0) {
        fail('settlement', 'UNSOLD_WITH_BIDS', 'O lote consta como encerrado sem vencedor, mas possui lances.')
      }
    } else {
      if (!last || last.bidder_id !== lot.winner_id || last.amount_cents !== lot.winning_bid_cents) {
        fail('settlement', 'WINNER_MISMATCH', 'O vencedor/valor do lote não corresponde ao último lance do histórico.')
      }
      const receipt = (await db('receipts').where({ lot_id: lot.id }).first()) as ReceiptRow | undefined
      if (!receipt) {
        fail('settlement', 'RECEIPT_MISSING', 'O lote foi arrematado, mas o comprovante não existe.')
      } else {
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
        if (!sealOk) fail('settlement', 'RECEIPT_SEAL_INVALID', 'O selo do comprovante não confere.')
        if (
          receipt.amount_cents !== last?.amount_cents ||
          receipt.head_hash !== last?.hash ||
          receipt.bid_count !== bids.length ||
          receipt.winner_alias !== bidderAlias(lot.id, last?.bidder_id ?? '')
        ) {
          fail('settlement', 'RECEIPT_MISMATCH', 'O comprovante não corresponde ao histórico atual de lances.')
        }
      }
      const sale = await db('wallet_transactions').where({ lot_id: lot.id, type: 'sale' }).first()
      if (!sale || sale.amount_cents !== last?.amount_cents) {
        fail('settlement', 'LEDGER_MISMATCH', 'O lançamento financeiro da venda não corresponde ao último lance.')
      }
    }
  }

  const failed = new Set(issues.map((i) => i.check))
  return {
    lotId: lot.id,
    title: lot.title,
    status: lot.status,
    checkedAt: new Date().toISOString(),
    integrity: { ok: issues.length === 0, issues },
    checks: CHECKS.map((c) => ({ ...c, ok: !failed.has(c.id) })),
    bidCount: bids.length,
    headHash: last?.hash ?? null,
    bids: bids.map((b) => ({
      seq: b.seq,
      alias: bidderAlias(lot.id, b.bidder_id),
      amountCents: b.amount_cents,
      placedAt: b.placed_at.toISOString(),
      hash: b.hash,
      prevHash: b.prev_hash,
    })),
  }
}
