import 'dotenv/config'
import { z } from 'zod'

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/leilao'),
  DATABASE_SSL: bool('false'),
  JWT_SECRET: z.string().min(16).default('dev-only-jwt-secret-change-me'),
  CHAIN_SECRET: z.string().min(16).default('dev-only-chain-secret-change-me'),
  CORS_ORIGIN: z.string().default('*'),
  AUTO_MIGRATE: bool('true'),
  AUTO_SEED: bool('false'),
  SNIPING_WINDOW_SECONDS: z.coerce.number().int().positive().default(120),
  SNIPING_EXTENSION_SECONDS: z.coerce.number().int().positive().default(120),
  SETTLEMENT_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  FIPE_BASE_URL: z.string().url().default('https://fipe.parallelum.com.br/api/v2'),
  FIPE_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  CATALOG_TTL_HOURS: z.coerce.number().positive().default(24),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.issues)
  process.exit(1)
}

export const env = parsed.data

if (
  env.NODE_ENV === 'production' &&
  (env.JWT_SECRET.startsWith('dev-only') || env.CHAIN_SECRET.startsWith('dev-only'))
) {
  console.error('Defina JWT_SECRET e CHAIN_SECRET em produção.')
  process.exit(1)
}
