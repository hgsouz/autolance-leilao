import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CirclePlus, ExternalLink, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Countdown } from '@/components/Countdown'
import { CreateLotForm } from '@/components/CreateLotForm'
import { PhaseBadge } from '@/components/LotCard'
import { ConfirmModal, Empty, ErrorBox, PageLoader, SectionTitle, useToast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { brl, dateTime } from '@/lib/format'
import { useLiveStream } from '@/lib/hooks'
import type { Lot } from '@/lib/types'

export default function Panel() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [toCancel, setToCancel] = useState<Lot | null>(null)
  const received = useRef(Date.now())

  const q = useQuery({ queryKey: ['panel', user?.id], queryFn: api.auctioneerLots, refetchInterval: 10_000 })
  received.current = q.dataUpdatedAt || received.current
  useLiveStream(undefined, [['panel']])

  const cancel = useMutation({
    mutationFn: (lot: Lot) => api.cancelLot(lot.id, lot.bidCount > 0),
    onSuccess: (r) => {
      toast.success(r.refundedCents > 0 ? `Lote cancelado. ${brl(r.refundedCents)} liberados ao licitante líder.` : 'Lote cancelado.')
      setToCancel(null)
      qc.invalidateQueries({ queryKey: ['panel'] })
      qc.invalidateQueries({ queryKey: ['lots'] })
    },
    onError: (e: unknown) => {
      toast.error(e)
      setToCancel(null)
      qc.invalidateQueries({ queryKey: ['panel'] })
    },
  })

  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { items, totals } = q.data

  const stats = [
    { label: 'Total recebido', value: brl(totals.receivedCents), strong: true },
    { label: 'Lotes vendidos', value: String(totals.soldCount) },
    { label: 'Sem vencedor', value: String(totals.unsoldCount) },
    { label: 'Ao vivo', value: String(totals.liveCount) },
    { label: 'Agendados', value: String(totals.scheduledCount) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SectionTitle kicker="Leiloeiro" title="Painel do leiloeiro">
        <button className={creating ? 'btn-outline' : 'btn-primary'} onClick={() => setCreating((c) => !c)}>
          <CirclePlus className="h-4 w-4" /> {creating ? 'Fechar formulário' : 'Novo lote'}
        </button>
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.strong ? 'col-span-2 border-transparent bg-hero text-white md:col-span-1' : 'card-flat'}`}>
            <p className={`caps ${s.strong ? '!text-white/70' : ''}`}>{s.label}</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {creating && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-extrabold">Criar lote</h2>
          <CreateLotForm
            onCreated={() => {
              setCreating(false)
              qc.invalidateQueries({ queryKey: ['panel'] })
              qc.invalidateQueries({ queryKey: ['lots'] })
              qc.invalidateQueries({ queryKey: ['facets'] })
            }}
          />
        </div>
      )}

      <h2 className="mb-4 mt-10 text-xl font-extrabold">Meus lotes</h2>
      {items.length === 0 ? (
        <Empty title="Você ainda não criou lotes">Clique em “Novo lote” para buscar um veículo e abrir o primeiro leilão.</Empty>
      ) : (
        <ul className="space-y-3">
          {items.map((lot) => {
            const canCancel = lot.phase === 'live' || lot.phase === 'scheduled'
            return (
              <li key={lot.id} className="card-flat flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PhaseBadge phase={lot.phase} sold={lot.outcome?.sold} />
                    <span className="text-xs text-muted">
                      {dateTime(lot.startsAt)} → {dateTime(lot.endsAt)}
                    </span>
                  </div>
                  <Link to={`/lotes/${lot.id}`} className="mt-1.5 block truncate text-lg font-bold hover:text-primary">
                    {lot.title}
                  </Link>
                  <p className="text-sm text-muted">
                    Inicial {brl(lot.startingBidCents)} · Incremento {brl(lot.minIncrementCents)} · {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'}
                    {lot.currentBidCents ? <> · Atual <strong className="text-ink">{brl(lot.currentBidCents)}</strong></> : null}
                  </p>
                  {lot.phase === 'ended' && (
                    <p className="mt-1 text-sm font-semibold">
                      {lot.outcome?.sold
                        ? <>Arrematado por <span className="text-primary">{lot.outcome.winnerAlias}</span> por {brl(lot.outcome.winningBidCents ?? 0)}{!lot.outcome.settled && ' (liquidando…)'}</>
                        : 'Encerrado sem lances (sem vencedor)'}
                    </p>
                  )}
                  {(lot.phase === 'live' || lot.phase === 'scheduled') && <Countdown lot={lot} receivedAt={received.current} className="mt-1 block text-sm" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/lotes/${lot.id}`} className="btn-outline !py-2 text-xs">
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </Link>
                  <Link to={`/auditoria/${lot.id}`} className="btn-outline !py-2 text-xs">
                    <ShieldCheck className="h-4 w-4" /> Auditoria
                  </Link>
                  {canCancel && (
                    <button className="btn-outline !py-2 text-xs !text-accent" onClick={() => setToCancel(lot)}>
                      <Ban className="h-4 w-4" /> Cancelar
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmModal
        open={!!toCancel}
        title="Cancelar este lote?"
        confirmLabel={toCancel && toCancel.bidCount > 0 ? 'Cancelar e estornar' : 'Cancelar lote'}
        danger
        busy={cancel.isPending}
        onClose={() => setToCancel(null)}
        onConfirm={() => toCancel && cancel.mutate(toCancel)}
      >
        {toCancel && toCancel.bidCount > 0 ? (
          <p>
            Este lote já recebeu <strong>{toCancel.bidCount}</strong> {toCancel.bidCount === 1 ? 'lance' : 'lances'}. Ao cancelar, o valor
            comprometido do licitante líder ({brl(toCancel.currentBidCents ?? 0)}) é <strong>liberado automaticamente</strong> (estorno) e o lote
            some da vitrine.
          </p>
        ) : (
          <p>O lote ainda não recebeu lances e será removido da vitrine. Esta ação não pode ser desfeita.</p>
        )}
      </ConfirmModal>
    </div>
  )
}
