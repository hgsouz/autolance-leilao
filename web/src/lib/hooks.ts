import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { API_URL } from './api'

/**
 * Relógio sincronizado com o servidor: `offsetMs` = (hora do servidor) - (hora local) no momento
 * em que a resposta chegou. Assim a contagem regressiva não depende do relógio do usuário.
 */
export function useServerNow(offsetMs: number, everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now() + offsetMs)
  useEffect(() => {
    setNow(Date.now() + offsetMs)
    const t = setInterval(() => setNow(Date.now() + offsetMs), everyMs)
    return () => clearInterval(t)
  }, [offsetMs, everyMs])
  return now
}

export const serverOffset = (serverTimeIso: string, receivedAt: number) => Date.parse(serverTimeIso) - receivedAt

/**
 * Assina o SSE da API. Cada evento invalida as queries indicadas, então a tela atualiza
 * sem recarregar. Se o SSE cair (proxy, rede), o `refetchInterval` das queries cobre.
 */
export function useLiveStream(lotId: string | undefined, invalidateKeys: unknown[][]) {
  const qc = useQueryClient()
  const keysRef = useRef(invalidateKeys)
  keysRef.current = invalidateKeys

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(`${API_URL}/stream${lotId ? `?lot=${encodeURIComponent(lotId)}` : ''}`)
    const onLot = () => {
      for (const key of keysRef.current) qc.invalidateQueries({ queryKey: key })
    }
    es.addEventListener('lot', onLot)
    return () => {
      es.removeEventListener('lot', onLot)
      es.close()
    }
  }, [lotId, qc])
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
