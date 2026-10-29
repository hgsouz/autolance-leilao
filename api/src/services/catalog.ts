import type { Knex } from 'knex'
import { env } from '../env'
import { AppError } from '../lib/errors'
import type { VehicleAttributes } from '../types'
import {
  fallbackBrands,
  fallbackModels,
  fallbackVehicle,
  fallbackYears,
  isFallbackCode,
} from './fallbackCatalog'

export type CatalogSource = 'fipe' | 'cache' | 'stale-cache' | 'fallback'
export interface CatalogItem {
  code: string
  name: string
}
export interface Vehicle extends VehicleAttributes {
  brandCode: string
  modelCode: string
  yearCode: string
  priceCents: number
}

const TTL_MS = env.CATALOG_TTL_HOURS * 3600 * 1000
const UNAVAILABLE = () =>
  new AppError(
    503,
    'CATALOG_UNAVAILABLE',
    'A API pública de veículos está indisponível no momento. Tente novamente em instantes ou use o catálogo de amostra.',
  )

async function fetchJson(path: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (env.FIPE_TOKEN) headers['X-Subscription-Token'] = env.FIPE_TOKEN
  const res = await fetch(`${env.FIPE_BASE_URL}${path}`, { headers, signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`FIPE respondeu HTTP ${res.status}`)
  return res.json()
}

/** Lê do cache do banco (fresco) -> API externa -> cache vencido -> fallback. */
async function cached<T>(
  db: Knex,
  key: string,
  loader: () => Promise<T>,
  fallback?: () => T | null,
): Promise<{ data: T; source: CatalogSource }> {
  const row = (await db('catalog_cache').where({ key }).first()) as { payload: T; fetched_at: Date } | undefined
  if (row && Date.now() - row.fetched_at.getTime() < TTL_MS) return { data: row.payload, source: 'cache' }
  try {
    const data = await loader()
    await db('catalog_cache')
      .insert({ key, payload: JSON.stringify(data), fetched_at: new Date() })
      .onConflict('key')
      .merge()
    return { data, source: 'fipe' }
  } catch (err) {
    console.warn(`[catalog] falha ao consultar a API externa (${key}):`, (err as Error).message)
    if (row) return { data: row.payload, source: 'stale-cache' }
    const fb = fallback?.()
    if (fb) return { data: fb, source: 'fallback' }
    throw UNAVAILABLE()
  }
}

function asList(payload: unknown, ...keys: string[]): CatalogItem[] {
  let list: unknown = payload
  if (!Array.isArray(list) && list && typeof list === 'object') {
    for (const k of keys) {
      const candidate = (list as Record<string, unknown>)[k]
      if (Array.isArray(candidate)) {
        list = candidate
        break
      }
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .map((i) => ({ code: String((i as any).code ?? (i as any).codigo), name: String((i as any).name ?? (i as any).nome) }))
    .filter((i) => i.code && i.name && i.code !== 'undefined')
}

/** "R$ 62.000,00" -> 6200000 */
export function parsePriceToCents(price: string): number {
  const normalized = price.replace(/[^\d,]/g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}

export async function listBrands(db: Knex, opts: { forceFallback?: boolean } = {}) {
  if (opts.forceFallback) return { source: 'fallback' as const, items: fallbackBrands() }
  const { data, source } = await cached(
    db,
    'fipe:brands',
    async () => {
      const items = asList(await fetchJson('/cars/brands'), 'brands', 'marcas')
      if (!items.length) throw new Error('lista de marcas vazia')
      return items
    },
    fallbackBrands,
  )
  return { source, items: data }
}

export async function listModels(db: Knex, brandCode: string) {
  if (isFallbackCode(brandCode)) return { source: 'fallback' as const, items: fallbackModels(brandCode) }
  const { data, source } = await cached(db, `fipe:models:${brandCode}`, async () => {
    const items = asList(await fetchJson(`/cars/brands/${encodeURIComponent(brandCode)}/models`), 'models', 'modelos')
    if (!items.length) throw new Error('lista de modelos vazia')
    return items
  })
  return { source, items: data }
}

export async function listYears(db: Knex, brandCode: string, modelCode: string) {
  if (isFallbackCode(brandCode)) return { source: 'fallback' as const, items: fallbackYears(brandCode, modelCode) }
  const { data, source } = await cached(db, `fipe:years:${brandCode}:${modelCode}`, async () => {
    const items = asList(
      await fetchJson(
        `/cars/brands/${encodeURIComponent(brandCode)}/models/${encodeURIComponent(modelCode)}/years`,
      ),
      'years',
      'anos',
    )
    if (!items.length) throw new Error('lista de anos vazia')
    return items
  })
  return { source, items: data }
}

export async function getVehicle(
  db: Knex,
  brandCode: string,
  modelCode: string,
  yearCode: string,
): Promise<{ source: CatalogSource; vehicle: Vehicle }> {
  const base = { brandCode, modelCode, yearCode }

  if (isFallbackCode(brandCode)) {
    const v = fallbackVehicle(brandCode, modelCode, yearCode)
    if (!v) throw new AppError(404, 'NOT_FOUND', 'Veículo não encontrado no catálogo de amostra.')
    return { source: 'fallback', vehicle: { ...base, ...v, fipePriceCents: v.priceCents, source: 'fallback' } }
  }

  const { data, source } = await cached(db, `fipe:vehicle:${brandCode}:${modelCode}:${yearCode}`, async () => {
    const raw = (await fetchJson(
      `/cars/brands/${encodeURIComponent(brandCode)}/models/${encodeURIComponent(modelCode)}/years/${encodeURIComponent(yearCode)}`,
    )) as Record<string, any>
    if (!raw || typeof raw.price !== 'string') throw new Error('resposta de veículo inesperada')
    return {
      brand: String(raw.brand),
      model: String(raw.model),
      modelYear: Number(raw.modelYear),
      fuel: String(raw.fuel ?? ''),
      priceCents: parsePriceToCents(raw.price),
      codeFipe: String(raw.codeFipe ?? ''),
      referenceMonth: String(raw.referenceMonth ?? ''),
    }
  })
  return {
    source,
    vehicle: { ...base, ...data, fipePriceCents: data.priceCents, source: 'fipe' },
  }
}

/**
 * Sugestão de foto (opcional, "best effort") via API pública da Wikipédia.
 * Nunca é aplicada automaticamente: o leiloeiro vê o preview e confirma ou troca a URL.
 */
export async function suggestImage(db: Knex, brand: string, model: string): Promise<string | null> {
  const first = model.split(/\s+/)[0] ?? model
  const key = `img:${brand}|${first}`.toLowerCase()
  const row = (await db('catalog_cache').where({ key }).first()) as { payload: { url: string | null } } | undefined
  if (row) return row.payload.url

  try {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `${brand} ${first} car`,
      gsrlimit: '4',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '960',
      format: 'json',
    }).toString()
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LeilaoCarros/1.0 (teste tecnico)' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as any
    const pages = Object.values(json?.query?.pages ?? {}) as any[]
    pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    const found = pages.find((p) => p?.thumbnail?.source)?.thumbnail?.source ?? null
    await db('catalog_cache')
      .insert({ key, payload: JSON.stringify({ url: found }), fetched_at: new Date() })
      .onConflict('key')
      .merge()
    return found
  } catch (err) {
    console.warn('[catalog] sugestão de imagem indisponível:', (err as Error).message)
    return null
  }
}
