import { buildApp } from './app'
import { db } from './db/knex'
import { seedDatabase } from './db/seed'
import { env } from './env'
import { startSettlementLoop } from './services/settlement'

const app = await buildApp(db)

if (env.AUTO_MIGRATE) {
  const [, files] = await db.migrate.latest()
  if (files.length) app.log.info(`Migrations aplicadas: ${files.join(', ')}`)
}
if (env.AUTO_SEED) {
  const seeded = await seedDatabase(db)
  if (seeded) app.log.info('Dados de demonstração criados (AUTO_SEED).')
}

const stopSettlement = startSettlementLoop(db, env.SETTLEMENT_INTERVAL_MS)

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recebido, encerrando...`)
  stopSettlement()
  await app.close()
  await db.destroy()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ port: env.PORT, host: env.HOST })
