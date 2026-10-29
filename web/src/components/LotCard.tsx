import { Car, Fuel, Gavel, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { brlShort } from '@/lib/format'
import type { Lot, Phase } from '@/lib/types'
import { Countdown } from './Countdown'

export function PhaseBadge({ phase, sold }: { phase: Phase; sold?: boolean }) {
  if (phase === 'live')
    return (
      <span className="badge bg-accent text-white">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
        Ao vivo
      </span>
    )
  if (phase === 'scheduled') return <span className="badge bg-primary-soft text-primary">Agendado</span>
  if (phase === 'canceled') return <span className="badge bg-surface-3 text-muted">Cancelado</span>
  return (
    <span className="badge bg-surface-3 text-muted">{sold === false ? 'Encerrado sem lances' : 'Encerrado'}</span>
  )
}

export function VehiclePhoto({ lot, className = '' }: { lot: Pick<Lot, 'imageUrl' | 'title' | 'attributes'>; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-[#0b2a6b] to-[#04193b] ${className}`}>
      {lot.imageUrl ? (
        <img
          src={lot.imageUrl}
          alt={lot.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/55">
        <Car className="h-10 w-10" />
        <span className="text-[11px] font-semibold uppercase tracking-widest">{lot.attributes.brand}</span>
      </div>
    </div>
  )
}

export function LotCard({ lot, receivedAt }: { lot: Lot; receivedAt: number }) {
  const price = lot.currentBidCents ?? lot.startingBidCents
  const sold = lot.outcome?.sold
  const shownPrice = lot.phase === 'ended' && lot.outcome?.winningBidCents ? lot.outcome.winningBidCents : price

  return (
    <Link
      to={`/lotes/${lot.id}`}
      className="card-flat group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
    >
      <div className="relative">
        <VehiclePhoto lot={lot} className="aspect-[16/10]" />
        <div className="absolute left-3 top-3">
          <PhaseBadge phase={lot.phase} sold={sold} />
        </div>
        {lot.me?.isLeading && (
          <span className="badge absolute right-3 top-3 bg-white text-[#04193b]">
            <Trophy className="h-3 w-3 text-accent" /> Você lidera
          </span>
        )}
        {lot.me?.isWinner && (
          <span className="badge absolute right-3 top-3 bg-white text-[#04193b]">
            <Trophy className="h-3 w-3 text-accent" /> Arrematado por você
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="caps">
          {lot.attributes.brand} · {lot.attributes.modelYear}
        </p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold leading-snug group-hover:text-primary">{lot.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Fuel className="h-3.5 w-3.5" /> {lot.attributes.fuel}
        </p>

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="caps">
                {lot.phase === 'ended' ? (sold ? 'Arrematado por' : 'Lance inicial') : lot.currentBidCents ? 'Lance atual' : 'Lance inicial'}
              </p>
              <p className="font-display text-xl font-extrabold tabular-nums text-ink">{brlShort(shownPrice)}</p>
            </div>
            <p className="flex items-center gap-1 pb-1 text-xs text-muted">
              <Gavel className="h-3.5 w-3.5" /> {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
            </p>
          </div>
          {(lot.phase === 'live' || lot.phase === 'scheduled') && (
            <Countdown lot={lot} receivedAt={receivedAt} className="mt-2 block rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-ink" />
          )}
        </div>
      </div>
    </Link>
  )
}
