import { db } from './db/knex'
import { DEMO_PASSWORD, DEMO_USERS, seedDatabase } from './db/seed'

const command = process.argv[2]

async function main() {
  switch (command) {
    case 'migrate': {
      const [batch, files] = await db.migrate.latest()
      console.log(files.length ? `Migrations aplicadas (lote ${batch}): ${files.join(', ')}` : 'Banco já está atualizado.')
      break
    }
    case 'seed': {
      const created = await seedDatabase(db)
      console.log(created ? 'Seed aplicado.' : 'Seed ignorado: os dados de demonstração já existem.')
      if (created) printCredentials()
      break
    }
    case 'reset': {
      await db.migrate.rollback(undefined, true)
      await db.migrate.latest()
      await seedDatabase(db)
      console.log('Banco recriado e populado.')
      printCredentials()
      break
    }
    default:
      console.log('Uso: cli <migrate|seed|reset>')
      process.exitCode = 1
  }
}

function printCredentials() {
  console.log(`\nContas de demonstração (senha: ${DEMO_PASSWORD})`)
  console.log(`  Leiloeiro: ${DEMO_USERS.auctioneer.email}`)
  console.log(`  Cliente 1: ${DEMO_USERS.bidder1.email}`)
  console.log(`  Cliente 2: ${DEMO_USERS.bidder2.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.destroy())
