import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { placeBid } from '../src/services/bids'
import { cancelLot } from '../src/services/lots'
import { settleDueLots } from '../src/services/settlement'
import { getWallet } from '../src/services/wallet'
import { addHistoricBids, db, endLotNow, makeLot, makeUser, migrateFresh, resetData } from './helpers'

const bid = (lotId: string, userId: string, reais: number) =>
  placeBid(db, { lotId, userId, amountCents: reais * 100 })

const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ code })
}

beforeAll(migrateFresh)
beforeEach(resetData)
afterAll(() => db.destroy())

describe('regras de lance', () => {
  it('o primeiro lance deve ser >= lance inicial', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000 })

    await expectCode(bid(lot, a, 999), 'BELOW_MINIMUM')
    const ok = await bid(lot, a, 1000)
    expect(ok.currentBidCents).toBe(100_000)
    expect(ok.minNextBidCents).toBe(110_000)
  })

  it('os seguintes devem ser >= lance atual + incremento mínimo', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)
    const b = await makeUser('bidder', 50_000)
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000, incrementReais: 100 })

    await bid(lot, a, 1000)
    await expectCode(bid(lot, b, 1099), 'BELOW_MINIMUM')
    await expect(bid(lot, b, 1100)).resolves.toMatchObject({ currentBidCents: 110_000 })
  })

  it('o líder não pode cobrir o próprio lance', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)
    const lot = await makeLot({ auctioneerId: seller })
    await bid(lot, a, 1000)
    await expectCode(bid(lot, a, 5000), 'ALREADY_LEADING')
  })

  it('o leiloeiro não pode dar lances', async () => {
    const seller = await makeUser('auctioneer', 50_000)
    const lot = await makeLot({ auctioneerId: seller })
    await expectCode(bid(lot, seller, 1000), 'AUCTIONEER_CANNOT_BID')
  })

  it('só aceita lances em lotes ao vivo (agendado, encerrado e cancelado)', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)

    const scheduled = await makeLot({ auctioneerId: seller, startsInMs: 3_600_000, endsInMs: 7_200_000 })
    await expectCode(bid(scheduled, a, 1000), 'LOT_NOT_STARTED')

    const ended = await makeLot({ auctioneerId: seller })
    await endLotNow(ended)
    await expectCode(bid(ended, a, 1000), 'LOT_ENDED')

    const canceled = await makeLot({ auctioneerId: seller })
    await cancelLot(db, seller, canceled, { refund: false })
    await expectCode(bid(canceled, a, 1000), 'LOT_CANCELED')
  })

  it('rejeita lance sem saldo disponível', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 500)
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000 })
    await expectCode(bid(lot, a, 1000), 'INSUFFICIENT_BALANCE')
  })
})

describe('saldo comprometido', () => {
  it('compromete ao liderar, bloqueia outros lances e libera ao ser superado', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 1000)
    const b = await makeUser('bidder', 10_000)
    const lot1 = await makeLot({ auctioneerId: seller, startingReais: 800 })
    const lot2 = await makeLot({ auctioneerId: seller, startingReais: 300 })

    await bid(lot1, a, 800)
    let w = await getWallet(db, a)
    expect(w).toMatchObject({ totalCents: 100_000, committedCents: 80_000, availableCents: 20_000 })

    // só sobram R$ 200: o lance de R$ 300 em outro lote não cabe
    await expectCode(bid(lot2, a, 300), 'INSUFFICIENT_BALANCE')

    // b supera a: o valor de a volta imediatamente ao disponível
    await bid(lot1, b, 900)
    w = await getWallet(db, a)
    expect(w).toMatchObject({ committedCents: 0, availableCents: 100_000 })
    await expect(bid(lot2, a, 300)).resolves.toBeTruthy()
  })

  it('apenas um de dois lances simultâneos do mesmo usuário cabe no saldo', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 1000)
    const lot1 = await makeLot({ auctioneerId: seller, startingReais: 700 })
    const lot2 = await makeLot({ auctioneerId: seller, startingReais: 700 })

    const results = await Promise.allSettled([bid(lot1, a, 700), bid(lot2, a, 700)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const w = await getWallet(db, a)
    expect(w.committedCents).toBe(70_000)
  })
})

describe('concorrência', () => {
  it('lances idênticos simultâneos: só um é aceito', async () => {
    const seller = await makeUser('auctioneer')
    const bidders = await Promise.all(Array.from({ length: 10 }, () => makeUser('bidder', 10_000)))
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000 })

    const results = await Promise.allSettled(bidders.map((u) => bid(lot, u, 1000)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const row = await db('lots').where({ id: lot }).first()
    expect(row.bid_count).toBe(1)
  })

  it('rajada de lances crescentes mantém a cadeia e as regras consistentes', async () => {
    const seller = await makeUser('auctioneer')
    const bidders = await Promise.all(Array.from({ length: 8 }, () => makeUser('bidder', 1_000_000)))
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000, incrementReais: 100 })

    await Promise.allSettled(
      bidders.flatMap((u, i) => [1, 2, 3].map((round) => bid(lot, u, 1000 + (round * 8 + i) * 100))),
    )
    const { auditLot } = await import('../src/services/audit')
    const audit = await auditLot(db, lot)
    expect(audit.bidCount).toBeGreaterThan(1)
    expect(audit.integrity.issues).toEqual([])
    expect(audit.integrity.ok).toBe(true)
  })
})

describe('prorrogação (anti-sniping)', () => {
  it('lance nos últimos 2 minutos estende o fim do lote para +2 minutos', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)
    const lot = await makeLot({ auctioneerId: seller, endsInMs: 30_000 })

    const before = Date.now()
    const r = await bid(lot, a, 1000)
    expect(r.extended).toBe(true)
    const ends = new Date(r.endsAt).getTime()
    expect(ends).toBeGreaterThan(before + 115_000)
    expect(ends).toBeLessThan(Date.now() + 121_000)
  })

  it('lance fora da janela não altera o fim do lote', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 50_000)
    const lot = await makeLot({ auctioneerId: seller, endsInMs: 600_000 })
    const original = (await db('lots').where({ id: lot }).first()).ends_at.getTime()

    const r = await bid(lot, a, 1000)
    expect(r.extended).toBe(false)
    expect(new Date(r.endsAt).getTime()).toBe(original)
  })
})

describe('liquidação', () => {
  it('debita o vencedor, credita o leiloeiro e gera o comprovante', async () => {
    const seller = await makeUser('auctioneer')
    const a = await makeUser('bidder', 10_000)
    const b = await makeUser('bidder', 10_000)
    const lot = await makeLot({ auctioneerId: seller, startingReais: 1000 })
    await addHistoricBids(lot, [
      { by: a, reais: 1000, agoMs: 300_000 },
      { by: b, reais: 1200, agoMs: 200_000 },
    ])
    await endLotNow(lot)
    expect(await settleDueLots(db)).toBe(1)

    const l = await db('lots').where({ id: lot }).first()
    expect(l).toMatchObject({ status: 'settled', winner_id: b, winning_bid_cents: 120_000 })

    expect((await getWallet(db, b)).totalCents).toBe(880_000)
    expect((await getWallet(db, a)).totalCents).toBe(1_000_000)
    expect((await db('users').where({ id: seller }).first()).balance_cents).toBe(120_000)

    const receipt = await db('receipts').where({ lot_id: lot }).first()
    expect(receipt).toMatchObject({ amount_cents: 120_000, bid_count: 2 })
    expect(receipt.code.length).toBeGreaterThanOrEqual(10)
  })

  it('é idempotente e lotes sem lances fecham sem vencedor', async () => {
    const seller = await makeUser('auctioneer')
    const lot = await makeLot({ auctioneerId: seller })
    await endLotNow(lot)
    expect(await settleDueLots(db)).toBe(1)
    expect(await settleDueLots(db)).toBe(0)
    const l = await db('lots').where({ id: lot }).first()
    expect(l).toMatchObject({ status: 'settled', winner_id: null })
    expect(await db('receipts').where({ lot_id: lot }).first()).toBeUndefined()
  })
})

describe('cancelamento', () => {
  it('cancela lote sem lances', async () => {
    const seller = await makeUser('auctioneer')
    const lot = await makeLot({ auctioneerId: seller })
    await cancelLot(db, seller, lot, { refund: false })
    expect((await db('lots').where({ id: lot }).first()).status).toBe('canceled')
  })

  it('lote com lances exige confirmação e estorna automaticamente o líder', async () => {
    const seller = await makeUser('auctioneer')
    const other = await makeUser('auctioneer')
    const a = await makeUser('bidder', 5000)
    const lot = await makeLot({ auctioneerId: seller })
    await bid(lot, a, 1500)
    expect((await getWallet(db, a)).committedCents).toBe(150_000)

    await expectCode(cancelLot(db, seller, lot, { refund: false }), 'LOT_HAS_BIDS')
    await expectCode(cancelLot(db, other, lot, { refund: true }), 'FORBIDDEN')

    await cancelLot(db, seller, lot, { refund: true })
    expect(await getWallet(db, a)).toMatchObject({ committedCents: 0, availableCents: 500_000 })
  })

  it('não cancela lote já encerrado', async () => {
    const seller = await makeUser('auctioneer')
    const lot = await makeLot({ auctioneerId: seller })
    await endLotNow(lot)
    await expectCode(cancelLot(db, seller, lot, { refund: true }), 'LOT_ENDED')
  })
})
