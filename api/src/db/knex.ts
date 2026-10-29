import knexLib, { type Knex } from 'knex'
import pg from 'pg'
import { env } from '../env'
import { migrationSource } from './migrations'

// bigint (oid 20) vem como string por padrão; valores em centavos cabem com folga em Number.
pg.types.setTypeParser(20, (v) => parseInt(v, 10))

export type Db = Knex | Knex.Transaction

export function createDb(connectionString: string = env.DATABASE_URL): Knex {
  return knexLib({
    client: 'pg',
    connection: {
      connectionString,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    },
    pool: { min: 0, max: 10 },
    migrations: { migrationSource },
  })
}

export const db = createDb()
