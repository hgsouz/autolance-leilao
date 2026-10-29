import type {
  Audit,
  AuctioneerLots,
  Bid,
  CatalogList,
  CatalogVehicle,
  Facets,
  Lot,
  LotList,
  MyBids,
  PlaceBidResult,
  Receipt,
  User,
  Wallet,
} from './types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/$/, '')

const TOKEN_KEY = 'auth_token'
export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t)
    } catch {
      /* armazenamento indisponível */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* noop */
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.')
  }

  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const code = (data as any)?.code ?? 'ERROR'
    if (res.status === 401 && token && code === 'UNAUTHORIZED') {
      tokenStore.clear()
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new ApiError(res.status, code, (data as any)?.message ?? `Erro ${res.status}`, (data as any)?.details)
  }
  return data as T
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const out = s.toString()
  return out ? `?${out}` : ''
}

export interface LotFilters {
  phase?: 'live' | 'scheduled' | 'ended'
  q?: string
  brand?: string
  fuel?: string
  minPriceCents?: number
  maxPriceCents?: number
  sort?: string
  limit?: number
}

export interface CreateLotPayload {
  brandCode: string
  modelCode: string
  yearCode: string
  title?: string
  description?: string
  imageUrl?: string
  startingBidCents: number
  minIncrementCents: number
  startsAt?: string
  endsAt: string
}

export const api = {
  register: (b: { name: string; email: string; password: string; role: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: b }),
  login: (b: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: b }),
  me: () => request<{ user: User }>('/auth/me'),

  lots: (f: LotFilters) => request<LotList>(`/lots${qs({ ...f })}`),
  facets: () => request<Facets>('/lots/facets'),
  lot: (id: string) => request<Lot>(`/lots/${id}`),
  bids: (id: string) => request<{ items: Bid[] }>(`/lots/${id}/bids`),
  placeBid: (id: string, amountCents: number) =>
    request<PlaceBidResult>(`/lots/${id}/bids`, { method: 'POST', body: { amountCents } }),
  audit: (id: string) => request<Audit>(`/lots/${id}/audit`),
  receipt: (code: string) => request<Receipt>(`/receipts/${encodeURIComponent(code)}`),

  wallet: () => request<Wallet>('/wallet'),
  deposit: (amountCents: number) => request<Wallet>('/wallet/deposit', { method: 'POST', body: { amountCents } }),
  myBids: () => request<MyBids>('/me/bids'),

  auctioneerLots: () => request<AuctioneerLots>('/auctioneer/lots'),
  createLot: (b: CreateLotPayload) => request<Lot>('/lots', { method: 'POST', body: b }),
  cancelLot: (id: string, refund: boolean) =>
    request<{ ok: boolean; refundedCents: number }>(`/lots/${id}/cancel`, { method: 'POST', body: { refund } }),

  brands: (fallback: boolean) => request<CatalogList>(`/catalog/brands${fallback ? '?source=fallback' : ''}`),
  models: (brand: string) => request<CatalogList>(`/catalog/models${qs({ brand })}`),
  years: (brand: string, model: string) => request<CatalogList>(`/catalog/years${qs({ brand, model })}`),
  vehicle: (brand: string, model: string, year: string) =>
    request<CatalogVehicle>(`/catalog/vehicle${qs({ brand, model, year })}`),
  image: (brand: string, model: string) => request<{ url: string | null }>(`/catalog/image${qs({ brand, model })}`),
}
