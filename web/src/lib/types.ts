export type Role = 'auctioneer' | 'bidder'
export type Phase = 'scheduled' | 'live' | 'ended' | 'canceled'

export interface User {
  id: string
  name: string
  email: string
  role: Role
}

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

export interface Lot {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  attributes: VehicleAttributes
  phase: Phase
  startsAt: string
  endsAt: string
  serverTime: string
  startingBidCents: number
  minIncrementCents: number
  currentBidCents: number | null
  bidCount: number
  minNextBidCents: number
  leaderAlias: string | null
  auctioneerAlias: string
  outcome: {
    settled: boolean
    sold: boolean
    winningBidCents: number | null
    winnerAlias: string | null
  } | null
  me: {
    role: Role
    isOwner: boolean
    alias: string | null
    hasBid: boolean
    isLeading: boolean
    isWinner: boolean
    receiptCode: string | null
  } | null
}

export interface LotList {
  serverTime: string
  items: Lot[]
}

export interface Bid {
  seq: number
  alias: string
  amountCents: number
  placedAt: string
  mine: boolean
}

export interface PlaceBidResult {
  bid: { seq: number; amountCents: number; placedAt: string }
  extended: boolean
  endsAt: string
  currentBidCents: number
  minNextBidCents: number
}

export interface Wallet {
  totalCents: number
  committedCents: number
  availableCents: number
  transactions: {
    id: string
    type: 'deposit' | 'purchase' | 'sale' | 'release'
    amountCents: number
    note: string | null
    lotId: string | null
    createdAt: string
  }[]
}

export type MyBidState = 'leading' | 'outbid' | 'won' | 'lost' | 'canceled'
export interface MyBids {
  items: { state: MyBidState; myHighestBidCents: number; lot: Lot }[]
}

export interface AuctioneerLots {
  serverTime: string
  items: Lot[]
  totals: {
    receivedCents: number
    soldCount: number
    unsoldCount: number
    liveCount: number
    scheduledCount: number
    canceledCount: number
  }
}

export interface Audit {
  lotId: string
  title: string
  status: 'open' | 'settled' | 'canceled'
  checkedAt: string
  integrity: {
    ok: boolean
    issues: { check: string; code: string; message: string; seq?: number }[]
  }
  checks: { id: string; label: string; ok: boolean }[]
  bidCount: number
  headHash: string | null
  bids: { seq: number; alias: string; amountCents: number; placedAt: string; hash: string; prevHash: string }[]
}

export interface Receipt {
  code: string
  lotId: string
  title: string
  imageUrl: string | null
  attributes: VehicleAttributes
  amountCents: number
  winnerAlias: string
  auctioneerAlias: string
  bidCount: number
  headHash: string
  issuedAt: string
  valid: boolean
  sealOk: boolean
  auditOk: boolean
}

export interface CatalogItem {
  code: string
  name: string
}
export type CatalogSource = 'fipe' | 'cache' | 'stale-cache' | 'fallback'
export interface CatalogList {
  source: CatalogSource
  items: CatalogItem[]
}
export interface CatalogVehicle {
  source: CatalogSource
  vehicle: VehicleAttributes & {
    brandCode: string
    modelCode: string
    yearCode: string
    priceCents: number
  }
}

export interface Facets {
  brands: string[]
  fuels: string[]
}
