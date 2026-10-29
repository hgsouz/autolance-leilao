import type { Db } from '../db/knex'

/** Relógio do banco (ms). Todas as regras de tempo usam este relógio, nunca o do cliente. */
export async function dbNow(db: Db): Promise<Date> {
  const r = await db.raw(`select date_trunc('milliseconds', clock_timestamp()) as now`)
  return r.rows[0].now as Date
}
