import type { OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { bus, type LotEvent } from '../lib/bus'

/**
 * Server-Sent Events: avisa o front quando um lote muda (lance, prorrogação, encerramento).
 * O evento carrega só o id do lote; o front busca o estado atualizado pela API normal,
 * então nenhum dado privado trafega pelo stream. `?lot=<id>` filtra por lote.
 */
export async function streamRoutes(app: FastifyInstance) {
  app.get('/stream', async (req, reply) => {
    const { lot } = z.object({ lot: z.string().optional() }).parse(req.query)

    reply.hijack()
    // Com hijack os headers do CORS (já na `reply`) precisam ser repassados manualmente.
    const headers: OutgoingHttpHeaders = {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
    reply.raw.writeHead(200, headers)
    reply.raw.write('retry: 3000\n\n')

    const onEvent = (e: LotEvent) => {
      if (lot && e.lotId !== lot) return
      reply.raw.write(`event: lot\ndata: ${JSON.stringify(e)}\n\n`)
    }
    bus.on('lot', onEvent)
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15_000)

    req.raw.on('close', () => {
      clearInterval(ping)
      bus.off('lot', onEvent)
    })
  })
}
