export type Role = 'auctioneer' | 'bidder'

export interface UserRow {
  id: string
  name: string
  email: string
  password_hash: string
  role: Role
  balance_cents: number
  created_at: Date
}

export type LotStatus = 'open' | 'settled' | 'canceled'

export interface VehicleAttributes {
  brand: string
  model: string
  modelYear: number
  fuel: string
  codeFipe: string
  fipePriceCents: number
  referenceMonth: string
  source: string
}

export interface LotRow {
  id: string
  auctioneer_id: string
  status: LotStatus
  title: string
  description: string | null
  image_url: string | null
  attributes: VehicleAttributes
  starting_bid_cents: number
  min_increment_cents: number
  starts_at: Date
  original_ends_at: Date
  ends_at: Date
  current_bid_cents: number | null
  leader_id: string | null
  bid_count: number
  head_hash: string | null
  head_seal: string
  winner_id: string | null
  winning_bid_cents: number | null
  settled_at: Date | null
  canceled_at: Date | null
  created_at: Date
}

export interface BidRow {
  id: string
  lot_id: string
  bidder_id: string
  seq: number
  amount_cents: number
  placed_at: Date
  prev_hash: string
  hash: string
}

export interface ReceiptRow {
  id: string
  code: string
  lot_id: string
  title: string
  winner_alias: string
  auctioneer_alias: string
  amount_cents: number
  bid_count: number
  head_hash: string
  issued_at: Date
  seal: string
}

export interface Viewer {
  id: string
  role: Role
}
