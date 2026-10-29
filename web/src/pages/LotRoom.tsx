import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Fuel,
  Gavel,
  ReceiptText,
  ShieldCheck,
  Trophy,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Countdown, useLotClock } from '@/components/Countdown'
import { PhaseBadge, VehiclePhoto } from '@/components/LotCard'
import { ErrorBox, Field, MoneyInput, PageLoader, Spinner, useToast } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { brl, dateTime, formatRemaining, timeWithSeconds } from '@/lib/format'
import { useLiveStream } from '@/lib/hooks'
import type { Lot } from '@/lib/types'

export default function LotRoom() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const lotQ = useQuery({
    queryKey: ['lot', id, user?.id ?? null],
    queryFn: () => api.lot(id),
    refetchInterval: (q) => (q.state.data?.phase === 'live' || q.state.data?.phase === 'scheduled' ? 5000 : false),
  })
  const bidsQ = useQuery({
    queryKey: ['bids', id, user?.id ?? null],
    queryFn: () => api.bids(id),
    refetchInterval: lotQ.data?.phase === 'live' ? 5000 : false,
  })
  const walletQ = useQuery({
    queryKey: ['wallet', user?.id],
    queryFn: api.wallet,
    enabled: user?.role === 'bidder',
    refetchInterval: lotQ.data?.phase === 'live' ? 10_000 : false,
  })

  useLiveStream(id, [['lot', id], ['bids', id], ['wallet']])

  const lot = lotQ.data
  const receivedAt = lotQ.dataUpdatedAt || Date.now()

  // Avisos de transição (superado / prorrogado) detectados nas atualizações em tempo real.
  const prev = useRef<Lot | null>(null)
  useEffect(() => {
    if (!lot) return
    const p = prev.current
    if (p && p.id === lot.id) {
      if (p.me?.isLeading && lot.me && !lot.me.isLeading && lot.phase === 'live') {
        toast.info('Você foi superado! Dê um novo lance para voltar à liderança.')
      }
      if (lot.phase === 'live' && Date.parse(lot.endsAt) > Date.parse(p.endsAt)) {
        toast.info('Lote prorrogado: um lance na reta final estendeu o encerramento.')
      }
      if (p.phase === 'live' && lot.phase === 'ended') toast.info('Este leilão foi encerrado.')
    }
    prev.current = lot
  }, [lot, toast])

  // Quando o relógio chega a zero, força uma consulta para refletir o encerramento/liquidação.
  const { untilEnd } = useLotClock(
    lot ?? { serverTime: new Date().toISOString(), startsAt: new Date().toISOString(), endsAt: new Date().toISOString() },
    receivedAt,
  )
  useEffect(() => {
    if (lot?.phase !== 'live' || untilEnd > 0) return
    const t = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['lot', id] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
    }, 1500)
    return () => clearTimeout(t)
  }, [lot?.phase, untilEnd, qc, id])

  if (lotQ.isLoading) return <PageLoader label="Carregando sala…" />
  if (lotQ.isError || !lot) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ErrorBox error={lotQ.error ?? new Error('Lote não encontrado.')} retry={() => lotQ.refetch()} />
        <p className="text-center">
          <Link to="/" className="btn-outline">
            Voltar à vitrine
          </Link>
        </p>
      </div>
    )
  }

  const a = lot.attributes
  const isBidder = user?.role === 'bidder'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Vitrine
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ---- Coluna esquerda: veículo ---- */}
        <div className="space-y-6">
          <div className="card-flat overflow-hidden">
            <div className="relative">
              <VehiclePhoto lot={lot} className="aspect-[16/9]" />
              <div className="absolute left-4 top-4">
                <PhaseBadge phase={lot.phase} sold={lot.outcome?.sold} />
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="caps">
                {a.brand} · {a.modelYear}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{lot.title}</h1>
              {lot.description && <p className="mt-3 whitespace-pre-line text-sm text-muted">{lot.description}</p>}

              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Marca', a.brand],
                  ['Modelo', a.model],
                  ['Ano', String(a.modelYear)],
                  ['Combustível', a.fuel],
                  ['Código FIPE', a.codeFipe],
                  ['Valor FIPE', a.fipePriceCents ? brl(a.fipePriceCents) : '—'],
                  ['Referência', a.referenceMonth || '—'],
                  ['Leiloeiro', lot.auctioneerAlias],
                ].map(([k, v]) => (
                  <div key={k} className="card p-3">
                    <dt className="caps">{k}</dt>
                    <dd className="mt-1 flex items-center gap-1 break-words text-sm font-semibold">
                      {k === 'Combustível' && <Fuel className="h-3.5 w-3.5 text-muted" />}
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              {a.source !== 'fipe' && (
                <p className="mt-3 text-xs text-muted">
                  {a.source === 'seed'
                    ? 'Lote de demonstração: dados do catálogo de amostra, não da Tabela FIPE.'
                    : a.source === 'fallback'
                      ? 'Dados do catálogo de amostra (a API pública estava indisponível ao criar o lote).'
                      : null}
                </p>
              )}
            </div>
          </div>

          <BidHistory lotId={lot.id} bidsQ={bidsQ} />
        </div>

        {/* ---- Coluna direita: painel de lance ---- */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card-flat p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="caps">
                  {lot.phase === 'ended' && lot.outcome?.sold
                    ? 'Arrematado por'
                    : lot.currentBidCents
                      ? 'Lance atual'
                      : 'Lance inicial'}
                </p>
                <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
                  {brl(
                    lot.phase === 'ended' && lot.outcome?.winningBidCents
                      ? lot.outcome.winningBidCents
                      : (lot.currentBidCents ?? lot.startingBidCents),
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {(lot.phase === 'live' || lot.phase === 'scheduled') && (
                  <p className="caps">{lot.phase === 'scheduled' ? 'Abre em' : 'Termina em'}</p>
                )}
                <Countdown lot={lot} receivedAt={receivedAt} className="block text-lg" hideLabel />
                {lot.phase === 'live' && <p className="mt-1 text-[11px] text-muted">Encerra {dateTime(lot.endsAt)}</p>}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Lances" value={String(lot.bidCount)} />
              <Stat label="Incremento" value={brl(lot.minIncrementCents)} />
              <Stat label="Líder" value={lot.leaderAlias ?? '—'} />
            </div>

            <StatusBanner lot={lot} isBidder={isBidder} />

            {lot.phase === 'live' && (
              <BidForm
                lot={lot}
                canBid={!!isBidder}
                loggedIn={!!user}
                availableCents={walletQ.data?.availableCents}
                onDone={() => {
                  qc.invalidateQueries({ queryKey: ['lot', id] })
                  qc.invalidateQueries({ queryKey: ['bids', id] })
                  qc.invalidateQueries({ queryKey: ['wallet'] })
                }}
              />
            )}
            {lot.phase === 'scheduled' && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-primary-soft px-3.5 py-3 text-sm">
                <Clock className="h-4 w-4 shrink-0 text-primary" />
                Os lances abrem em {dateTime(lot.startsAt)} ({formatRemaining(Date.parse(lot.startsAt) - Date.parse(lot.serverTime))}).
              </p>
            )}
          </div>

          {lot.me?.receiptCode && (
            <ReceiptCard code={lot.me.receiptCode} isWinner={lot.me.isWinner} />
          )}

          <Link to={`/auditoria/${lot.id}`} className="card flex items-center gap-3 p-4 transition hover:border-primary/50">
            <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-bold">Auditar histórico de lances</p>
              <p className="text-xs text-muted">Página pública: confirme que o histórico não foi adulterado.</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5">
      <p className="caps !text-[10px]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{value}</p>
    </div>
  )
}

function StatusBanner({ lot, isBidder }: { lot: Lot; isBidder: boolean }) {
  const me = lot.me
  if (lot.phase === 'live' && isBidder && me) {
    if (me.isLeading)
      return (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-soft px-4 py-3" role="status">
          <Trophy className="h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-display text-base font-extrabold">Você está ganhando!</p>
            <p className="text-xs text-muted">Seu lance é o maior. Aguarde: você só pode dar outro lance se alguém superá-lo.</p>
          </div>
        </div>
      )
    if (me.hasBid)
      return (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/50 bg-accent-soft px-4 py-3" role="status">
          <AlertTriangle className="h-6 w-6 shrink-0 text-accent" />
          <div>
            <p className="font-display text-base font-extrabold">Você foi superado</p>
            <p className="text-xs text-muted">Dê um novo lance para voltar à liderança.</p>
          </div>
        </div>
      )
  }
  if (lot.phase === 'ended') {
    if (me?.isWinner)
      return (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-soft px-4 py-3" role="status">
          <Trophy className="h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-display text-base font-extrabold">Parabéns, você arrematou este lote!</p>
            <p className="text-xs text-muted">O valor foi debitado da sua carteira. Seu comprovante está logo abaixo.</p>
          </div>
        </div>
      )
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm" role="status">
        {lot.outcome?.sold
          ? `Leilão encerrado. Arrematado por ${lot.outcome.winnerAlias} por ${brl(lot.outcome.winningBidCents ?? 0)}.`
          : 'Leilão encerrado sem lances: este lote não teve vencedor.'}
        {!lot.outcome?.settled && lot.outcome?.sold && (
          <span className="mt-1 block text-xs text-muted">Finalizando liquidação…</span>
        )}
      </div>
    )
  }
  if (lot.phase === 'canceled') {
    return <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">Este lote foi cancelado.</div>
  }
  return null
}

function BidForm({
  lot,
  canBid,
  loggedIn,
  availableCents,
  onDone,
}: {
  lot: Lot
  canBid: boolean
  loggedIn: boolean
  availableCents?: number
  onDone: () => void
}) {
  const toast = useToast()
  const [amount, setAmount] = useState<number | null>(lot.minNextBidCents)
  const [fieldKey, setFieldKey] = useState(0)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  const set = (cents: number) => {
    setAmount(cents)
    setFieldKey((k) => k + 1)
    setError(null)
  }

  // Se alguém cobrir e o mínimo subir acima do que está no campo, atualiza o campo.
  useEffect(() => {
    if (amount === null || amount < lot.minNextBidCents) set(lot.minNextBidCents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot.minNextBidCents])

  const mut = useMutation({
    mutationFn: (cents: number) => api.placeBid(lot.id, cents),
    onSuccess: (r) => {
      setError(null)
      toast.success(`Lance de ${brl(r.bid.amountCents)} registrado!`)
      if (r.extended) toast.info('Lote prorrogado em +2 minutos por causa do seu lance na reta final.')
      set(r.minNextBidCents)
      onDone()
    },
    onError: (e: unknown) => {
      const err = e as ApiError
      setError({ code: err.code ?? 'ERROR', message: err.message })
      // Estado possivelmente mudou (superado, encerrado...): atualiza a sala.
      onDone()
    },
  })

  if (!loggedIn) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-center text-sm">
        <p className="mb-3 text-muted">Entre ou crie uma conta de licitante para dar lances.</p>
        <div className="flex justify-center gap-2">
          <Link to="/entrar" state={{ from: `/lotes/${lot.id}` }} className="btn-primary">
            Entrar
          </Link>
          <Link to="/cadastro" className="btn-outline">
            Criar conta
          </Link>
        </div>
      </div>
    )
  }
  if (!canBid) {
    return (
      <p className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
        Leiloeiros não podem dar lances. Entre com uma conta de licitante para participar.
      </p>
    )
  }

  const iLead = !!lot.me?.isLeading
  const quick = [0, 1, 5].map((n) => lot.minNextBidCents + n * lot.minIncrementCents)

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (amount === null || amount <= 0) {
          setError({ code: 'INVALID', message: 'Informe o valor do lance.' })
          return
        }
        mut.mutate(amount)
      }}
    >
      <Field label={`Seu lance (mínimo ${brl(lot.minNextBidCents)})`}>
        <MoneyInput key={fieldKey} valueCents={amount} onChange={(c) => { setAmount(c); setError(null) }} disabled={iLead || mut.isPending} />
      </Field>

      <div className="flex flex-wrap gap-2">
        {quick.map((c, i) => (
          <button
            type="button"
            key={c}
            disabled={iLead || mut.isPending}
            onClick={() => set(c)}
            className="btn-outline !px-3 !py-1.5 text-xs tabular-nums"
          >
            {i === 0 ? 'Mínimo ' : `+${i === 1 ? 1 : 5} inc. `}
            {brl(c)}
          </button>
        ))}
      </div>

      {availableCents !== undefined && (
        <p className="text-xs text-muted">
          Saldo disponível: <strong className="text-ink">{brl(availableCents)}</strong>{' '}
          <Link to="/carteira" className="font-semibold text-primary hover:underline">
            Depositar
          </Link>
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-accent/50 bg-accent-soft px-3.5 py-3 text-sm" role="alert">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">Lance recusado</p>
            <p className="text-muted">{error.message}</p>
            {error.code === 'INSUFFICIENT_BALANCE' && (
              <Link to="/carteira" className="mt-1 inline-block font-semibold text-primary hover:underline">
                Ir para a carteira
              </Link>
            )}
          </div>
        </div>
      )}

      <button className="btn-danger w-full !py-3 text-base" disabled={iLead || mut.isPending}>
        {mut.isPending ? <Spinner className="h-4 w-4" /> : <Gavel className="h-4 w-4" />}
        {iLead ? 'Você já está ganhando' : 'Dar lance'}
      </button>
    </form>
  )
}

function BidHistory({ lotId, bidsQ }: { lotId: string; bidsQ: ReturnType<typeof useQuery<{ items: import('@/lib/types').Bid[] }>> }) {
  const items = bidsQ.data?.items ?? []
  const seen = useRef<Set<number>>(new Set())
  const first = useRef(true)
  const fresh = new Set<number>()
  for (const b of items) {
    if (!seen.current.has(b.seq) && !first.current) fresh.add(b.seq)
  }
  useEffect(() => {
    items.forEach((b) => seen.current.add(b.seq))
    first.current = false
  })

  return (
    <div className="card-flat p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Histórico de lances</h2>
        <Link to={`/auditoria/${lotId}`} className="text-xs font-semibold text-primary hover:underline">
          Ver auditoria completa
        </Link>
      </div>
      {bidsQ.isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nenhum lance ainda. Seja o primeiro!
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((b, i) => (
            <li key={b.seq} className={`flex items-center justify-between gap-3 py-3 ${fresh.has(b.seq) ? 'flash-bid' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="w-8 text-right font-display text-sm font-bold text-numeral">#{b.seq}</span>
                <div>
                  <p className="text-sm font-semibold">
                    {b.alias}
                    {b.mine && <span className="badge ml-2 bg-primary-soft text-primary">Você</span>}
                    {i === 0 && <span className="badge ml-2 bg-accent text-white">Maior lance</span>}
                  </p>
                  <p className="text-xs text-muted">{timeWithSeconds(b.placedAt)}</p>
                </div>
              </div>
              <p className="font-display text-base font-bold tabular-nums">{brl(b.amountCents)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ReceiptCard({ code, isWinner }: { code: string; isWinner: boolean }) {
  const toast = useToast()
  const url = `${window.location.origin}/comprovante/${code}`
  return (
    <div className="card-flat p-4">
      <div className="flex items-center gap-3">
        <ReceiptText className="h-6 w-6 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-bold">{isWinner ? 'Comprovante de arremate' : 'Comprovante do arremate'}</p>
          <p className="text-xs text-muted">Link público, pode ser compartilhado.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link to={`/comprovante/${code}`} className="btn-primary flex-1">
          <CheckCircle2 className="h-4 w-4" /> Ver comprovante
        </Link>
        <button
          className="btn-outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              toast.success('Link copiado!')
            } catch {
              toast.info(url)
            }
          }}
        >
          <Copy className="h-4 w-4" /> Copiar link
        </button>
      </div>
    </div>
  )
}
