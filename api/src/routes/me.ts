import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { auctioneerLots, bidderBids } from '../services/lots'
import { deposit, getWallet } from '../services/wallet'

const depositBody = z.object({
  amountCents: z.number('informe o valor do depósito').int('valor inválido').positive('o depósito deve ser maior que zero'),
})

export async function meRoutes(app: FastifyInstance) {
  app.get('/wallet', { onRequest: [app.requireRole('bidder')] }, async (req) => getWallet(app.db, req.user.sub))

  app.post('/wallet/deposit', { onRequest: [app.requireRole('bidder')] }, async (req, reply) => {
    const body = depositBody.parse(req.body)
    return reply.status(201).send(await deposit(app.db, req.user.sub, body.amountCents))
  })

  app.get('/me/bids', { onRequest: [app.requireRole('bidder')] }, async (req) => bidderBids(app.db, req.user.sub))

  app.get('/auctioneer/lots', { onRequest: [app.requireRole('auctioneer')] }, async (req) =>
    auctioneerLots(app.db, req.user.sub),
  )
}
