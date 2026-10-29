import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getVehicle, listBrands, listModels, listYears, suggestImage } from '../services/catalog'

/**
 * Proxy da API pública de veículos (Tabela FIPE), com cache em banco e fallback.
 * Usa query string (e não path params) porque os códigos podem conter ":" e "-".
 */
export async function catalogRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.requireRole('auctioneer')] }

  app.get('/catalog/brands', guard, async (req) => {
    const q = z.object({ source: z.enum(['fallback']).optional() }).parse(req.query)
    return listBrands(app.db, { forceFallback: q.source === 'fallback' })
  })

  app.get('/catalog/models', guard, async (req) => {
    const q = z.object({ brand: z.string().min(1) }).parse(req.query)
    return listModels(app.db, q.brand)
  })

  app.get('/catalog/years', guard, async (req) => {
    const q = z.object({ brand: z.string().min(1), model: z.string().min(1) }).parse(req.query)
    return listYears(app.db, q.brand, q.model)
  })

  app.get('/catalog/vehicle', guard, async (req) => {
    const q = z.object({ brand: z.string().min(1), model: z.string().min(1), year: z.string().min(1) }).parse(req.query)
    return getVehicle(app.db, q.brand, q.model, q.year)
  })

  app.get('/catalog/image', guard, async (req) => {
    const q = z.object({ brand: z.string().min(1), model: z.string().min(1) }).parse(req.query)
    return { url: await suggestImage(app.db, q.brand, q.model) }
  })
}
