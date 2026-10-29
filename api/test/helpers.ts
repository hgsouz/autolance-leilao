import { createDb } from '../src/db/knex'
import { appendBid } from '../src/services/chain'
import { insertLot } from '../src/services/lots'
import type { LotRow, Role } from '../src/types'

export const db = createDb()

export async function migrateFresh() {
  await db.migrate.rollback(undefined, true)
  await db.migrate.latest()
}

export async function resetData() {
  await db.raw('alter table bids disable trigger user')
  await db.raw('truncate table wallet_transactions, receipts, bids, lots, users, catalog_cache cascade')
  await db.raw('alter table bids enable trigger user')
}

/** Executa algo "direto no banco", como faria um DBA mal-intencionado: desligando o gatilho append-only. */
export async function directDbEdit(fn: () => Promise<unknown>) {
  await db.raw('alter table bids disable trigger bids_append_only')
  try {
    await fn()
  } finally {
    await db.raw('alter table bids enable trigger bids_append_only')
  }
}

let counter = 0
export async function makeUser(role: Role, balanceReais = 0): Promise<string> {
  counter++
  const [row] = await db('users')
    .insert({
      name: `${role} ${counter}`,
      email: `${role}${counter}-${Date.now()}@teste.dev`,
      password_hash: 'x',
      role,
      balance_cents: balanceReais * 100,
    })
    .returning('id')
  return row.id as string
}

export interface MakeLotOpts {
  auctioneerId: string
  startsInMs?: number
  endsInMs?: number
  startingReais?: number
  incrementReais?: number
}

export async function makeLot(o: MakeLotOpts): Promise<string> {
  const now = Date.now()
  return insertLot(db, {
    auctioneerId: o.auctioneerId,
    title: 'Fiat Argo 2022',
    attributes: {
      brand: 'Fiat',
      model: 'Argo Drive 1.0',
      modelYear: 2022,
      fuel: 'Gasolina',
      codeFipe: 'TESTE-001',
      fipePriceCents: 70_000_00,
      referenceMonth: 'teste',
      source: 'test',
    },
    startingBidCents: (o.startingReais ?? 1000) * 100,
    minIncrementCents: (o.incrementReais ?? 100) * 100,
    startsAt: new Date(now + (o.startsInMs ?? -3_600_000)),
    endsAt: new Date(now + (o.endsInMs ?? 3_600_000)),
  })
}

/** Insere lances históricos direto na cadeia (sem regras), com horários passados. */
export async function addHistoricBids(lotId: string, bids: { by: string; reais: number; agoMs: number }[]) {
  await db.transaction(async (trx) => {
    let lot = (await trx('lots').where({ id: lotId }).forUpdate().first()) as LotRow
    for (const b of bids) {
      lot = (await appendBid(trx, lot, b.by, b.reais * 100, new Date(Date.now() - b.agoMs))).lot
    }
  })
}

export const endLotNow = (lotId: string) =>
  db('lots')
    .where({ id: lotId })
    .update({ ends_at: new Date(Date.now() - 1000) })
