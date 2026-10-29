import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink, ReceiptText } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { VehiclePhoto } from '@/components/LotCard'
import { Empty, ErrorBox, PageLoader, SectionTitle, useToast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { brl, dateTime } from '@/lib/format'
import { useLiveStream } from '@/lib/hooks'
import type { MyBidState } from '@/lib/types'

const STATE: Record<MyBidState, { label: string; cls: string }> = {
  leading: { label: 'Você está ganhando', cls: 'bg-primary text-white' },
  outbid: { label: 'Você foi superado', cls: 'bg-accent text-white' },
  won: { label: 'Arrematado por você', cls: 'bg-primary text-white' },
  lost: { label: 'Não arrematado', cls: 'bg-surface-3 text-muted' },
  canceled: { label: 'Lote cancelado', cls: 'bg-surface-3 text-muted' },
}

export default function MyBids() {
  const { user } = useAuth()
  const toast = useToast()
  const q = useQuery({ queryKey: ['mybids', user?.id], queryFn: api.myBids, refetchInterval: 15_000 })
  useLiveStream(undefined, [['mybids']])
  const received = useRef(Date.now())
  received.current = q.dataUpdatedAt || received.current

  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />

  const items = q.data.items
  const won = items.filter((i) => i.state === 'won')
  const active = items.filter((i) => i.state === 'leading' || i.state === 'outbid')
  const others = items.filter((i) => i.state === 'lost' || i.state === 'canceled')

  const share = async (code: string) => {
    const url = `${window.location.origin}/comprovante/${code}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link do comprovante copiado!')
    } catch {
      toast.info(url)
    }
  }

  const Row = ({ item }: { item: (typeof items)[number] }) => {
    const { lot, state } = item
    const code = lot.me?.receiptCode
    return (
      <li className="card-flat flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <Link to={`/lotes/${lot.id}`} className="block sm:w-48 sm:shrink-0">
          <VehiclePhoto lot={lot} className="aspect-[16/10] rounded-xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <span className={`badge ${STATE[state].cls}`}>{STATE[state].label}</span>
          <Link to={`/lotes/${lot.id}`} className="mt-2 block truncate text-lg font-bold hover:text-primary">
            {lot.title}
          </Link>
          <p className="mt-1 text-sm text-muted">
            Seu maior lance: <strong className="text-ink">{brl(item.myHighestBidCents)}</strong>
            {state === 'won' && lot.outcome?.winningBidCents ? (
              <> · Arremate: <strong className="text-ink">{brl(lot.outcome.winningBidCents)}</strong></>
            ) : lot.currentBidCents ? (
              <> · Lance atual: <strong className="text-ink">{brl(lot.currentBidCents)}</strong></>
            ) : null}
          </p>
          <p className="text-xs text-muted">{lot.phase === 'live' ? `Encerra ${dateTime(lot.endsAt)}` : `Encerrou ${dateTime(lot.endsAt)}`}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col">
          {state === 'won' && code && (
            <>
              <Link to={`/comprovante/${code}`} className="btn-primary !py-2 text-xs">
                <ReceiptText className="h-4 w-4" /> Comprovante
              </Link>
              <button className="btn-outline !py-2 text-xs" onClick={() => share(code)}>
                <Copy className="h-4 w-4" /> Copiar link
              </button>
            </>
          )}
          {state === 'won' && !code && <span className="text-xs text-muted">Emitindo comprovante…</span>}
          <Link to={`/lotes/${lot.id}`} className="btn-ghost !py-2 text-xs">
            <ExternalLink className="h-4 w-4" /> Abrir lote
          </Link>
        </div>
      </li>
    )
  }

  const Group = ({ title, list }: { title: string; list: typeof items }) =>
    list.length === 0 ? null : (
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">
          {title} <span className="text-numeral">({list.length})</span>
        </h2>
        <ul className="space-y-3">
          {list.map((i) => (
            <Row key={i.lot.id} item={i} />
          ))}
        </ul>
      </section>
    )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionTitle kicker="Licitante" title="Meus arremates" />
      {items.length === 0 ? (
        <Empty title="Você ainda não deu lances">
          Escolha um lote ao vivo na <Link to="/" className="font-semibold text-primary hover:underline">vitrine</Link> e dê o seu primeiro lance.
        </Empty>
      ) : (
        <>
          <Group title="Lotes vencidos" list={won} />
          <Group title="Em disputa" list={active} />
          <Group title="Anteriores" list={others} />
        </>
      )}
    </div>
  )
}
