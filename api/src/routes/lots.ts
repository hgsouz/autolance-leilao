import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { notFound } from '../lib/errors'
import { auditLot } from '../services/audit'
import { placeBid } from '../services/bids'
import { cancelLot, createLot, getLot, listBids, listLots, lotFacets } from '../services/lots'
import { getReceipt } from '../services/receipts'

const idParam = z.object({ id: z.uuid() })

const listQuery = z.object({
  phase: z.enum(['live', 'scheduled', 'ended']).optional(),
  q: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(60).optional(),
  fuel: z.string().trim().max(40).optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['ending', 'newest', 'price_asc', 'price_desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const bidBody = z.object({
  amountCents: z.number('informe o valor do lance').int('valor inválido').positive('o lance deve ser maior que zero'),
})

const createBody = z
  .object({
    brandCode: z.string().min(1),
    modelCode: z.string().min(1),
    yearCode: z.string().min(1),
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.url('URL da imagem inválida').max(1000).optional().or(z.literal('')).nullable(),
    startingBidCents: z.number().int().positive('o lance inicial deve ser maior que zero').max(100_000_000_00),
    minIncrementCents: z.number().int().positive('o incremento mínimo deve ser maior que zero').max(10_000_000_00),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date(),
  })
  .transform((b) => ({ ...b, startsAt: b.startsAt ?? new Date() }))

const cancelBody = z.object({ refund: z.boolean().optional() }).optional()

/** Rotas de lotes, lances, auditoria pública e comprovantes. */
export async function lotRoutes(app: FastifyInstance) {
  app.get('/lots', async (req) => {
    const query = listQuery.parse(req.query)
    return listLots(app.db, query, await app.optionalViewer(req))
  })

  app.get('/lots/facets', async () => lotFacets(app.db))

  app.get('/lots/:id', async (req) => {
    const { id } = parseId(req.params)
    return getLot(app.db, id, await app.optionalViewer(req))
  })

  app.get('/lots/:id/bids', async (req) => {
    const { id } = parseId(req.params)
    return listBids(app.db, id, await app.optionalViewer(req))
  })

  app.post('/lots/:id/bids', { onRequest: [app.requireRole('bidder')] }, async (req, reply) => {
    const { id } = parseId(req.params)
    const body = bidBody.parse(req.body)
    const result = await placeBid(app.db, { lotId: id, userId: req.user.sub, amountCents: body.amountCents })
    return reply.status(201).send(result)
  })

  app.post('/lots', { onRequest: [app.requireRole('auctioneer')] }, async (req, reply) => {
    const body = createBody.parse(req.body)
    const lotId = await createLot(app.db, req.user.sub, {
      ...body,
      imageUrl: body.imageUrl || null,
    })
    return reply.status(201).send(await getLot(app.db, lotId, { id: req.user.sub, role: 'auctioneer' }))
  })

  app.post('/lots/:id/cancel', { onRequest: [app.requireRole('auctioneer')] }, async (req) => {
    const { id } = parseId(req.params)
    const body = cancelBody.parse(req.body ?? undefined)
    const result = await cancelLot(app.db, req.user.sub, id, { refund: body?.refund ?? false })
    return { ok: true, ...result }
  })

  // Público e sem login: qualquer pessoa pode auditar.
  app.get('/lots/:id/audit', async (req) => {
    const { id } = parseId(req.params)
    return auditLot(app.db, id)
  })

  app.get('/receipts/:code', async (req) => {
    const { code } = z.object({ code: z.string().min(6).max(40) }).parse(req.params)
    return getReceipt(app.db, code)
  })
}

function parseId(params: unknown) {
  const r = idParam.safeParse(params)
  if (!r.success) throw notFound('Lote')
  return r.data
}
