import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { settleDueLots } from '../src/services/settlement'
import { addHistoricBids, db, endLotNow, makeLot, migrateFresh, resetData } from './helpers'

let app: FastifyInstance

beforeAll(async () => {
  await migrateFresh()
  app = await buildApp(db, { logger: false })
})
beforeEach(resetData)
afterAll(async () => {
  await app.close()
  await db.destroy()
})

async function register(role: 'auctioneer' | 'bidder', name = 'Fulano de Tal') {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { name, email: `${role}-${Math.random().toString(36).slice(2)}@teste.dev`, password: 'Senha@123', role },
  })
  expect(res.statusCode).toBe(201)
  const { token, user } = res.json()
  return { token, user, auth: { authorization: `Bearer ${token}` } }
}

describe('autenticação e papéis', () => {
  it('registra, faz login e rejeita credenciais ruins', async () => {
    const u = await register('bidder')
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: u.user.email, password: 'Senha@123' } })
    expect(ok.statusCode).toBe(200)
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: u.user.email, password: 'errada!!' } })
    expect(bad.statusCode).toBe(401)
    expect(bad.json().code).toBe('INVALID_CREDENTIALS')
    const dup = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Outro', email: u.user.email, password: 'Senha@123', role: 'bidder' },
    })
    expect(dup.statusCode).toBe(409)
  })

  it('valida o corpo da requisição com mensagem em português', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { name: 'A', email: 'x', password: '1', role: 'bidder' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION_ERROR')
  })

  it('protege as rotas por papel', async () => {
    const bidder = await register('bidder')
    const auctioneer = await register('auctioneer')
    expect((await app.inject({ method: 'GET', url: '/wallet' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/wallet', headers: auctioneer.auth })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/auctioneer/lots', headers: bidder.auth })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/catalog/brands', headers: bidder.auth })).statusCode).toBe(403)
  })
})

describe('fluxo completo pela API', () => {
  it('depósito -> lance -> superado -> encerramento -> comprovante público + auditoria pública', async () => {
    const seller = await register('auctioneer')
    const a = await register('bidder', 'Alice Secreta')
    const b = await register('bidder', 'Bruno Secreto')
    const lotId = await makeLot({ auctioneerId: seller.user.id, startingReais: 1000, incrementReais: 100 })

    for (const u of [a, b]) {
      const dep = await app.inject({ method: 'POST', url: '/wallet/deposit', headers: u.auth, payload: { amountCents: 500_000 } })
      expect(dep.statusCode).toBe(201)
    }

    const low = await app.inject({ method: 'POST', url: `/lots/${lotId}/bids`, headers: a.auth, payload: { amountCents: 50_000 } })
    expect(low.statusCode).toBe(422)
    expect(low.json()).toMatchObject({ code: 'BELOW_MINIMUM' })
    expect(low.json().message).toMatch(/abaixo do mínimo/i)

    const first = await app.inject({ method: 'POST', url: `/lots/${lotId}/bids`, headers: a.auth, payload: { amountCents: 100_000 } })
    expect(first.statusCode).toBe(201)

    let detail = (await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: a.auth })).json()
    expect(detail.me).toMatchObject({ isLeading: true, hasBid: true })
    detail = (await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: b.auth })).json()
    expect(detail.me).toMatchObject({ isLeading: false, hasBid: false })

    const again = await app.inject({ method: 'POST', url: `/lots/${lotId}/bids`, headers: a.auth, payload: { amountCents: 200_000 } })
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('ALREADY_LEADING')

    const over = await app.inject({ method: 'POST', url: `/lots/${lotId}/bids`, headers: b.auth, payload: { amountCents: 110_000 } })
    expect(over.statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: a.auth })).json().me).toMatchObject({
      isLeading: false,
      hasBid: true,
    })

    const wallet = (await app.inject({ method: 'GET', url: '/wallet', headers: b.auth })).json()
    expect(wallet).toMatchObject({ totalCents: 500_000, committedCents: 110_000, availableCents: 390_000 })

    // histórico público: sem login e sem dados pessoais
    const bids = (await app.inject({ method: 'GET', url: `/lots/${lotId}/bids` })).json()
    expect(bids.items).toHaveLength(2)
    expect(JSON.stringify(bids)).not.toMatch(/Alice|Bruno|@teste\.dev/)
    expect(bids.items.every((i: any) => i.mine === false)).toBe(true)

    await endLotNow(lotId)
    await settleDueLots(db)

    // vencedor vê o código do comprovante; o público não
    const won = (await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: b.auth })).json()
    expect(won.me.isWinner).toBe(true)
    expect(won.me.receiptCode).toBeTruthy()
    const pub = (await app.inject({ method: 'GET', url: `/lots/${lotId}` })).json()
    expect(pub.me).toBeNull()
    expect(JSON.stringify(pub)).not.toContain(won.me.receiptCode)
    expect(pub.outcome).toMatchObject({ settled: true, sold: true, winningBidCents: 110_000 })

    const receipt = (await app.inject({ method: 'GET', url: `/receipts/${won.me.receiptCode}` })).json()
    expect(receipt).toMatchObject({ valid: true, amountCents: 110_000 })
    expect(JSON.stringify(receipt)).not.toMatch(/Alice|Bruno|@teste\.dev/)

    const audit = (await app.inject({ method: 'GET', url: `/lots/${lotId}/audit` })).json()
    expect(audit.integrity.ok).toBe(true)

    const mine = (await app.inject({ method: 'GET', url: '/me/bids', headers: b.auth })).json()
    expect(mine.items[0]).toMatchObject({ state: 'won', myHighestBidCents: 110_000 })
    const lost = (await app.inject({ method: 'GET', url: '/me/bids', headers: a.auth })).json()
    expect(lost.items[0].state).toBe('lost')

    const panel = (await app.inject({ method: 'GET', url: '/auctioneer/lots', headers: seller.auth })).json()
    expect(panel.totals).toMatchObject({ receivedCents: 110_000, soldCount: 1 })
  })
})

describe('vitrine', () => {
  it('separa ao vivo, agendados e encerrados e esconde cancelados', async () => {
    const seller = await register('auctioneer')
    const sid = seller.user.id
    const live = await makeLot({ auctioneerId: sid })
    const scheduled = await makeLot({ auctioneerId: sid, startsInMs: 3_600_000, endsInMs: 7_200_000 })
    const ended = await makeLot({ auctioneerId: sid })
    await endLotNow(ended)
    await settleDueLots(db)
    const canceled = await makeLot({ auctioneerId: sid })
    const res = await app.inject({ method: 'POST', url: `/lots/${canceled}/cancel`, headers: seller.auth, payload: {} })
    expect(res.statusCode).toBe(200)

    const ids = async (phase?: string) =>
      ((await app.inject({ method: 'GET', url: `/lots${phase ? `?phase=${phase}` : ''}` })).json().items as any[]).map((i) => i.id)

    expect(await ids('live')).toEqual([live])
    expect(await ids('scheduled')).toEqual([scheduled])
    expect(await ids('ended')).toEqual([ended])
    const all = await ids()
    expect(all).not.toContain(canceled)
    expect(all).toHaveLength(3)
  })

  it('busca e filtra lotes', async () => {
    const seller = await register('auctioneer')
    await makeLot({ auctioneerId: seller.user.id })
    expect(((await app.inject({ method: 'GET', url: '/lots?q=argo' })).json().items as any[]).length).toBe(1)
    expect(((await app.inject({ method: 'GET', url: '/lots?q=corolla' })).json().items as any[]).length).toBe(0)
    expect(((await app.inject({ method: 'GET', url: '/lots?brand=fiat&fuel=gasolina' })).json().items as any[]).length).toBe(1)
    expect(((await app.inject({ method: 'GET', url: '/lots?minPriceCents=999999999' })).json().items as any[]).length).toBe(0)
  })
})

describe('catálogo (API externa indisponível)', () => {
  it('cai no catálogo de amostra e permite criar um lote mesmo sem a API', async () => {
    const seller = await register('auctioneer')
    const brands = await app.inject({ method: 'GET', url: '/catalog/brands?source=fallback', headers: seller.auth })
    expect(brands.statusCode).toBe(200)
    const fiat = brands.json().items.find((b: any) => b.name === 'Fiat')
    const models = (await app.inject({ method: 'GET', url: `/catalog/models?brand=${encodeURIComponent(fiat.code)}`, headers: seller.auth })).json()
    expect(models.source).toBe('fallback')
    const model = models.items[0]
    const years = (await app.inject({ method: 'GET', url: `/catalog/years?brand=${encodeURIComponent(fiat.code)}&model=${encodeURIComponent(model.code)}`, headers: seller.auth })).json()

    const created = await app.inject({
      method: 'POST',
      url: '/lots',
      headers: seller.auth,
      payload: {
        brandCode: fiat.code,
        modelCode: model.code,
        yearCode: years.items[0].code,
        startingBidCents: 50_000_00,
        minIncrementCents: 500_00,
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ phase: 'live', attributes: { brand: 'Fiat', source: 'fallback' } })

    const past = await app.inject({
      method: 'POST',
      url: '/lots',
      headers: seller.auth,
      payload: {
        brandCode: fiat.code,
        modelCode: model.code,
        yearCode: years.items[0].code,
        startingBidCents: 50_000_00,
        minIncrementCents: 500_00,
        endsAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
    })
    expect(past.statusCode).toBe(422)
  })
})

describe('vitrine e auditoria continuam funcionando sem a API externa', () => {
  it('lotes, salas, auditoria e comprovante dependem só do banco', async () => {
    // O app de teste nunca chama a FIPE nestas rotas: tudo vem do banco (snapshot do veículo no lote).
    const seller = await register('auctioneer')
    const lot = await makeLot({ auctioneerId: seller.user.id })
    const bidder = await register('bidder')
    await addHistoricBids(lot, [{ by: bidder.user.id, reais: 1000, agoMs: 1000 }])
    for (const url of ['/lots', `/lots/${lot}`, `/lots/${lot}/bids`, `/lots/${lot}/audit`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200)
    }
  })
})
