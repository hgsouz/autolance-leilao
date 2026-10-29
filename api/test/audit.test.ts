import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLot } from '../src/services/audit'
import { settleDueLots } from '../src/services/settlement'
import { getReceipt } from '../src/services/receipts'
import { addHistoricBids, db, directDbEdit, endLotNow, makeLot, makeUser, migrateFresh, resetData } from './helpers'

beforeAll(migrateFresh)
beforeEach(resetData)
afterAll(() => db.destroy())

async function lotWithBids() {
  const seller = await makeUser('auctioneer')
  const a = await makeUser('bidder', 100_000)
  const b = await makeUser('bidder', 100_000)
  const lot = await makeLot({ auctioneerId: seller, startingReais: 1000, incrementReais: 100 })
  await addHistoricBids(lot, [
    { by: a, reais: 1000, agoMs: 50_000 },
    { by: b, reais: 1100, agoMs: 40_000 },
    { by: a, reais: 1300, agoMs: 30_000 },
    { by: b, reais: 1500, agoMs: 20_000 },
  ])
  return { seller, a, b, lot }
}

const codes = (r: Awaited<ReturnType<typeof auditLot>>) => r.integrity.issues.map((i) => i.code)

describe('histórico à prova de adulteração', () => {
  it('lote íntegro passa em todas as verificações', async () => {
    const { lot } = await lotWithBids()
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(true)
    expect(r.checks.every((c) => c.ok)).toBe(true)
    expect(r.bids).toHaveLength(4)
  })

  it('UPDATE/DELETE comuns são bloqueados pelo gatilho append-only', async () => {
    const { lot } = await lotWithBids()
    await expect(db('bids').where({ lot_id: lot, seq: 2 }).update({ amount_cents: 1 })).rejects.toThrow(/append-only/)
    await expect(db('bids').where({ lot_id: lot, seq: 4 }).del()).rejects.toThrow(/append-only/)
    await expect(db.raw('truncate table bids')).rejects.toThrow(/append-only/)
  })

  it('detecta valor de lance alterado direto no banco', async () => {
    const { lot } = await lotWithBids()
    await directDbEdit(() => db('bids').where({ lot_id: lot, seq: 2 }).update({ amount_cents: 100_001 }))
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(false)
    expect(codes(r)).toContain('HASH_MISMATCH')
  })

  it('detecta troca do autor do lance', async () => {
    const { lot, a, b } = await lotWithBids()
    await directDbEdit(() => db('bids').where({ lot_id: lot, seq: 4 }).update({ bidder_id: a }))
    expect(b).not.toBe(a)
    expect(codes(await auditLot(db, lot))).toContain('HASH_MISMATCH')
  })

  it('detecta lance removido do meio', async () => {
    const { lot } = await lotWithBids()
    await directDbEdit(() => db('bids').where({ lot_id: lot, seq: 2 }).del())
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(false)
    expect(codes(r)).toEqual(expect.arrayContaining(['SEQUENCE_GAP', 'CHAIN_BROKEN']))
  })

  it('detecta remoção do último lance (truncamento) mesmo se o lote for "ajustado" junto', async () => {
    const { lot } = await lotWithBids()
    const third = await db('bids').where({ lot_id: lot, seq: 3 }).first()
    await directDbEdit(async () => {
      await db('bids').where({ lot_id: lot, seq: 4 }).del()
      // o atacante também reverte o resumo do lote para parecer consistente...
      await db('lots').where({ id: lot }).update({
        bid_count: 3,
        head_hash: third.hash,
        current_bid_cents: third.amount_cents,
        leader_id: third.bidder_id,
      })
    })
    // ...mas não consegue refazer o selo, que depende do segredo do servidor
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(false)
    expect(codes(r)).toContain('SEAL_INVALID')
  })

  it('detecta remoção do último lance sem ajustar o lote', async () => {
    const { lot } = await lotWithBids()
    await directDbEdit(() => db('bids').where({ lot_id: lot, seq: 4 }).del())
    expect(codes(await auditLot(db, lot))).toContain('LOT_STATE_MISMATCH')
  })

  it('detecta lance forjado inserido no fim da cadeia', async () => {
    const { lot, b } = await lotWithBids()
    const last = await db('bids').where({ lot_id: lot, seq: 4 }).first()
    await directDbEdit(() =>
      db('bids').insert({
        lot_id: lot,
        bidder_id: b,
        seq: 5,
        amount_cents: 999_999,
        placed_at: new Date(),
        prev_hash: last.hash,
        hash: 'f'.repeat(64),
      }),
    )
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(false)
    expect(codes(r)).toEqual(expect.arrayContaining(['HASH_MISMATCH', 'LOT_STATE_MISMATCH']))
  })

  it('detecta alteração do estado do lote (lance atual / líder / incremento)', async () => {
    const { lot, a } = await lotWithBids()
    await db('lots').where({ id: lot }).update({ current_bid_cents: 1 })
    expect(codes(await auditLot(db, lot))).toContain('LOT_STATE_MISMATCH')

    await resetData()
    const second = await lotWithBids()
    await db('lots').where({ id: second.lot }).update({ leader_id: second.a })
    expect(a).toBeTruthy()
    expect(codes(await auditLot(db, second.lot))).toContain('SEAL_INVALID')

    await resetData()
    const third = await lotWithBids()
    await db('lots').where({ id: third.lot }).update({ min_increment_cents: 1 })
    expect(codes(await auditLot(db, third.lot))).toContain('SEAL_INVALID')
  })

  it('detecta adulteração do comprovante e do vencedor após a liquidação', async () => {
    const { lot } = await lotWithBids()
    await endLotNow(lot)
    await settleDueLots(db)
    expect((await auditLot(db, lot)).integrity.ok).toBe(true)

    const receipt = await db('receipts').where({ lot_id: lot }).first()
    expect((await getReceipt(db, receipt.code)).valid).toBe(true)

    await db('receipts').where({ lot_id: lot }).update({ amount_cents: 1 })
    const r = await auditLot(db, lot)
    expect(r.integrity.ok).toBe(false)
    expect(codes(r)).toEqual(expect.arrayContaining(['RECEIPT_SEAL_INVALID']))
    expect((await getReceipt(db, receipt.code)).valid).toBe(false)
  })

  it('a auditoria não expõe dados pessoais dos licitantes', async () => {
    const { lot, a, b, seller } = await lotWithBids()
    const users = await db('users').select('id', 'name', 'email')
    const json = JSON.stringify(await auditLot(db, lot))
    for (const u of users) {
      expect(json).not.toContain(u.id)
      expect(json).not.toContain(u.email)
      expect(json).not.toContain(u.name)
    }
    expect([a, b, seller]).toHaveLength(3)
  })
})
