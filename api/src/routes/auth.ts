import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../lib/errors'
import type { UserRow } from '../types'

const registerBody = z.object({
  name: z.string().trim().min(2, 'informe seu nome').max(80),
  email: z.email('e-mail inválido').max(160),
  password: z.string().min(8, 'a senha deve ter pelo menos 8 caracteres').max(100),
  role: z.enum(['auctioneer', 'bidder'], 'escolha o perfil: leiloeiro ou licitante'),
})

const loginBody = z.object({
  email: z.email('e-mail inválido'),
  password: z.string().min(1, 'informe a senha'),
})

const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role })

export async function authRoutes(app: FastifyInstance) {
  const sign = (u: UserRow) => app.jwt.sign({ sub: u.id, role: u.role })

  app.post('/auth/register', async (req, reply) => {
    const body = registerBody.parse(req.body)
    const email = body.email.toLowerCase()
    const exists = await app.db('users').whereRaw('lower(email) = ?', [email]).first('id')
    if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.')

    const [user] = (await app
      .db('users')
      .insert({
        name: body.name,
        email,
        password_hash: await bcrypt.hash(body.password, 10),
        role: body.role,
      })
      .returning('*')) as UserRow[]
    return reply.status(201).send({ token: sign(user!), user: publicUser(user!) })
  })

  app.post('/auth/login', async (req) => {
    const body = loginBody.parse(req.body)
    const user = (await app.db('users').whereRaw('lower(email) = ?', [body.email.toLowerCase()]).first()) as
      | UserRow
      | undefined
    const ok = user ? await bcrypt.compare(body.password, user.password_hash) : false
    if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
    return { token: sign(user), user: publicUser(user) }
  })

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = (await app.db('users').where({ id: req.user.sub }).first()) as UserRow | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Sessão inválida. Faça login novamente.')
    return { user: publicUser(user) }
  })
}
