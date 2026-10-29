import { createHmac, randomBytes } from 'node:crypto'
import { env } from '../env'

type Part = string | number | null | undefined

/** HMAC-SHA256 com segredo que NÃO fica no banco. */
export function hmac(parts: Part[]): string {
  return createHmac('sha256', env.CHAIN_SECRET)
    .update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|'))
    .digest('hex')
}

export const genesisHash = (lotId: string) => hmac(['genesis', lotId])

export const bidHash = (args: {
  prevHash: string
  lotId: string
  seq: number
  bidderId: string
  amountCents: number
  placedAt: Date
}) =>
  hmac([
    'bid',
    args.prevHash,
    args.lotId,
    args.seq,
    args.bidderId,
    args.amountCents,
    args.placedAt.toISOString(),
  ])

/** Apelido público do licitante: muda a cada lote, então não dá para correlacionar lotes. */
export const bidderAlias = (lotId: string, userId: string) =>
  'L-' + hmac(['alias-bidder', lotId, userId]).slice(0, 6).toUpperCase()

export const auctioneerAlias = (userId: string) =>
  'V-' + hmac(['alias-auctioneer', userId]).slice(0, 6).toUpperCase()

/** Selo do estado do lote: protege contagem, cabeça da cadeia, lance atual, líder e regras de lance. */
export const lotSeal = (lot: {
  id: string
  starting_bid_cents: number
  min_increment_cents: number
  bid_count: number
  head_hash: string | null
  current_bid_cents: number | null
  leader_id: string | null
}) =>
  hmac([
    'lot-seal',
    lot.id,
    lot.starting_bid_cents,
    lot.min_increment_cents,
    lot.bid_count,
    lot.head_hash,
    lot.current_bid_cents,
    lot.leader_id,
  ])

export const receiptSeal = (r: {
  code: string
  lotId: string
  winnerAlias: string
  auctioneerAlias: string
  amountCents: number
  bidCount: number
  headHash: string
  issuedAt: Date
}) =>
  hmac([
    'receipt',
    r.code,
    r.lotId,
    r.winnerAlias,
    r.auctioneerAlias,
    r.amountCents,
    r.bidCount,
    r.headHash,
    r.issuedAt.toISOString(),
  ])

export const newReceiptCode = () => randomBytes(9).toString('base64url')
