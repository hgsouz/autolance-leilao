import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { Knex } from 'knex'
import { ZodError } from 'zod'
import { env } from './env'
import { AppError } from './lib/errors'
import { authRoutes } from './routes/auth'
import { catalogRoutes } from './routes/catalog'
import { lotRoutes } from './routes/lots'
import { meRoutes } from './routes/me'
import { streamRoutes } from './routes/stream'
import type { Role, Viewer } from './types'

declare module 'fastify' {
  interface FastifyInstance {
    db: Knex
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (role: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalViewer: (req: FastifyRequest) => Promise<Viewer | null>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role }
    user: { sub: string; role: Role }
  }
}

export async function buildApp(db: Knex, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? env.NODE_ENV !== 'test', trustProxy: true })

  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  await app.register(cors, {
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '7d' } })

  app.decorate('db', db)

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify()
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Faça login para continuar.')
    }
  })

  app.decorate('requireRole', (role: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply)
    if (req.user.role !== role) {
      throw new AppError(
        403,
        'FORBIDDEN',
        role === 'auctioneer' ? 'Apenas leiloeiros podem fazer isso.' : 'Apenas licitantes podem fazer isso.',
      )
    }
  })

  app.decorate('optionalViewer', async (req: FastifyRequest): Promise<Viewer | null> => {
    if (!req.headers.authorization) return null
    try {
      const p = await req.jwtVerify<{ sub: string; role: Role }>()
      return { id: p.sub, role: p.role }
    } catch {
      return null
    }
  })

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: issues[0] ? `Dados inválidos: ${issues[0].message}` : 'Dados inválidos.',
        details: { issues },
      })
    }
    if (err instanceof AppError) {
      return reply.status(err.status).send({ code: err.code, message: err.message, details: err.details })
    }
    if (err?.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ code: err.code ?? 'BAD_REQUEST', message: err.message })
    }
    req.log.error(err)
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' })
  })

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ code: 'NOT_FOUND', message: 'Rota não encontrada.' }),
  )

  app.get('/health', async () => {
    await db.raw('select 1')
    return { ok: true, time: new Date().toISOString() }
  })

  await app.register(authRoutes)
  await app.register(lotRoutes)
  await app.register(meRoutes)
  await app.register(catalogRoutes)
  await app.register(streamRoutes)

  return app
}
