import bcrypt from 'bcryptjs'
import type { Knex } from 'knex'
import { dbNow } from '../lib/clock'
import { insertLot } from '../services/lots'
import { appendBid } from '../services/chain'
import { FALLBACK_VEHICLES, type FallbackVehicle } from '../services/fallbackCatalog'
import { settleLot } from '../services/settlement'
import { deposit } from '../services/wallet'
import type { LotRow } from '../types'

export const DEMO_PASSWORD = 'Senha@123'
export const DEMO_USERS = {
  auctioneer: { name: 'Leiloeiro Demo', email: 'leiloeiro@leilao.dev' },
  bidder1: { name: 'Cliente Um', email: 'cliente1@leilao.dev' },
  bidder2: { name: 'Cliente Dois', email: 'cliente2@leilao.dev' },
}

const H = 3_600_000
const D = 24 * H
const vehicle = (brand: string, model: string): [FallbackVehicle, number] => {
  const idx = FALLBACK_VEHICLES.findIndex((v) => v.brand === brand && v.model.startsWith(model))
  if (idx < 0) throw new Error(`Veículo de seed não encontrado: ${brand} ${model}`)
  return [FALLBACK_VEHICLES[idx]!, idx]
}

/**
 * Popula: 1 leiloeiro, 2 clientes (com saldo) e lotes em todas as fases, incluindo lotes ao
 * vivo com lances abertos. Idempotente: se o leiloeiro de demonstração já existe, não faz nada.
 */
export async function seedDatabase(db: Knex): Promise<boolean> {
  const exists = await db('users').where({ email: DEMO_USERS.auctioneer.email }).first('id')
  if (exists) return false

  const now = await dbNow(db)
  const at = (ms: number) => new Date(now.getTime() + ms)
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const mk = async (u: { name: string; email: string }, role: 'auctioneer' | 'bidder') => {
    const [row] = await db('users').insert({ ...u, role, password_hash }).returning('id')
    return row.id as string
  }
  const auctioneer = await mk(DEMO_USERS.auctioneer, 'auctioneer')
  const c1 = await mk(DEMO_USERS.bidder1, 'bidder')
  const c2 = await mk(DEMO_USERS.bidder2, 'bidder')

  await deposit(db, c1, 400_000_00)
  // Saldo folgado: os dois clientes já lideram lotes (valor comprometido) e ainda precisam
  // de saldo disponível para quem avalia conseguir dar novos lances sem depositar antes.
  await deposit(db, c2, 400_000_00)

  const newLot = async (
    brand: string,
    model: string,
    o: { start: number; end: number; startingBid: number; increment: number; description: string },
  ) => {
    const [v, idx] = vehicle(brand, model)
    return insertLot(db, {
      auctioneerId: auctioneer,
      title: `${v.brand} ${v.model} ${v.year}`,
      description: o.description,
      imageUrl: null,
      attributes: {
        brand: v.brand,
        model: v.model,
        modelYear: v.year,
        fuel: v.fuel,
        codeFipe: `AMOSTRA-${String(idx + 1).padStart(3, '0')}`,
        fipePriceCents: v.priceReais * 100,
        referenceMonth: 'dados de demonstração',
        source: 'seed',
      },
      startingBidCents: o.startingBid * 100,
      minIncrementCents: o.increment * 100,
      startsAt: at(o.start),
      endsAt: at(o.end),
    })
  }

  const addBids = async (lotId: string, bids: { by: string; amount: number; when: number }[]) => {
    await db.transaction(async (trx) => {
      let lot = (await trx('lots').where({ id: lotId }).forUpdate().first()) as LotRow
      for (const b of bids) {
        lot = (await appendBid(trx, lot, b.by, b.amount * 100, at(b.when))).lot
      }
    })
  }

  // --- Ao vivo, com lances abertos ---
  const corolla = await newLot('Toyota', 'Corolla', {
    start: -6 * H, end: 5 * D, startingBid: 90_000, increment: 1_000,
    description: 'Único dono, revisões em dia, IPVA quitado. Lote de demonstração com lances em andamento.',
  })
  await addBids(corolla, [
    { by: c1, amount: 90_000, when: -5 * H },
    { by: c2, amount: 91_000, when: -4 * H },
    { by: c1, amount: 92_500, when: -3 * H },
    { by: c2, amount: 94_000, when: -2 * H },
  ])

  const civic = await newLot('Honda', 'Civic', {
    start: -2 * H, end: 36 * H, startingBid: 105_000, increment: 1_500,
    description: 'Câmbio automático CVT, teto solar, baixa quilometragem.',
  })
  await addBids(civic, [{ by: c1, amount: 105_000, when: -1 * H }])

  await newLot('Jeep', 'Compass', {
    start: -1 * H, end: 3 * D, startingBid: 120_000, increment: 2_000,
    description: 'SUV completo, sem lances ainda. Seja o primeiro a dar um lance.',
  })

  const onix = await newLot('Chevrolet', 'Onix Plus', {
    start: -12 * H, end: 10 * D, startingBid: 60_000, increment: 1_000,
    description: 'Turbo, central multimídia, garantia de fábrica restante.',
  })
  await addBids(onix, [
    { by: c2, amount: 60_000, when: -10 * H },
    { by: c1, amount: 61_000, when: -8 * H },
    { by: c2, amount: 63_000, when: -6 * H },
  ])

  // --- Agendados ---
  await newLot('Hyundai', 'Creta', {
    start: 1 * D, end: 4 * D, startingBid: 100_000, increment: 1_500,
    description: 'Versão topo de linha. Abertura de lances amanhã.',
  })
  await newLot('BMW', '320i', {
    start: 2 * D, end: 5 * D, startingBid: 170_000, increment: 3_000,
    description: 'Sedan esportivo, pacote M Sport.',
  })

  // --- Encerrado e arrematado (gera comprovante) ---
  const toro = await newLot('Fiat', 'Toro', {
    start: -4 * D, end: -1 * D, startingBid: 70_000, increment: 1_000,
    description: 'Picape média, diesel não; flex. Lote encerrado de demonstração (com comprovante).',
  })
  await addBids(toro, [
    { by: c1, amount: 70_000, when: -3.5 * D },
    { by: c2, amount: 72_500, when: -3 * D },
    { by: c1, amount: 75_000, when: -2 * D },
  ])
  await settleLot(db, toro)

  // --- Encerrado sem lances ---
  await newLot('Volkswagen', 'Gol', {
    start: -5 * D, end: -3 * D, startingBid: 40_000, increment: 500,
    description: 'Lote encerrado sem lances (fecha sem vencedor).',
  })

  // --- Cancelado (não aparece na vitrine) ---
  const ranger = await newLot('Ford', 'Ranger', {
    start: -1 * D, end: 2 * D, startingBid: 150_000, increment: 2_000,
    description: 'Lote cancelado pelo leiloeiro.',
  })
  await db('lots').where({ id: ranger }).update({ status: 'canceled', canceled_at: now })

  return true
}
