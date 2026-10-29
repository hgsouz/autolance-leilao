import { useMemo } from 'react'
import { formatRemaining } from '@/lib/format'
import { serverOffset, useServerNow } from '@/lib/hooks'
import type { Lot } from '@/lib/types'

/** Contagem regressiva baseada no relógio do servidor (não do usuário). */
export function useLotClock(lot: Pick<Lot, 'serverTime' | 'startsAt' | 'endsAt'>, receivedAt: number) {
  const offset = useMemo(() => serverOffset(lot.serverTime, receivedAt), [lot.serverTime, receivedAt])
  const now = useServerNow(offset)
  return {
    now,
    untilStart: Date.parse(lot.startsAt) - now,
    untilEnd: Date.parse(lot.endsAt) - now,
  }
}

export function Countdown({
  lot,
  receivedAt,
  className = '',
  hideLabel = false,
}: {
  lot: Pick<Lot, 'serverTime' | 'startsAt' | 'endsAt' | 'phase'>
  receivedAt: number
  className?: string
  hideLabel?: boolean
}) {
  const { untilStart, untilEnd } = useLotClock(lot, receivedAt)

  if (lot.phase === 'scheduled') {
    return (
      <span className={className}>
        {!hideLabel && <span className="caps mr-1.5 whitespace-nowrap">Abre em</span>}
        <span className="whitespace-nowrap tabular-nums font-bold">{formatRemaining(untilStart)}</span>
      </span>
    )
  }
  if (lot.phase !== 'live') return null
  const urgent = untilEnd <= 120_000
  return (
    <span className={className}>
      {!hideLabel && <span className="caps mr-1.5 whitespace-nowrap">{urgent ? 'Reta final' : 'Termina em'}</span>}
      <span className={`whitespace-nowrap tabular-nums font-bold ${urgent ? 'text-accent' : ''}`}>{formatRemaining(untilEnd)}</span>
    </span>
  )
}
