import { EventEmitter } from 'node:events'

export type LotEvent = {
  lotId: string
  type: 'bid' | 'extended' | 'settled' | 'canceled' | 'created'
  at: string
}

/** Barramento em memória (uma instância da API). Alimenta o SSE do front. */
export const bus = new EventEmitter()
bus.setMaxListeners(0)

export function emitLot(lotId: string, type: LotEvent['type']) {
  const event: LotEvent = { lotId, type, at: new Date().toISOString() }
  bus.emit('lot', event)
}
