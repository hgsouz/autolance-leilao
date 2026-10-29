import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, ErrorBox, PageLoader, SectionTitle } from '@/components/ui'
import { LotCard } from '@/components/LotCard'
import { api, type LotFilters } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDebounced, useLiveStream } from '@/lib/hooks'
import { parseMoney } from '@/components/ui'

type Tab = 'live' | 'scheduled' | 'ended'
const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Ao vivo' },
  { id: 'scheduled', label: 'Agendados' },
  { id: 'ended', label: 'Encerrados' },
]
const SORTS = [
  { id: '', label: 'Padrão' },
  { id: 'ending', label: 'Terminando primeiro' },
  { id: 'newest', label: 'Mais recentes' },
  { id: 'price_asc', label: 'Menor preço' },
  { id: 'price_desc', label: 'Maior preço' },
]

export default function Home() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('live')
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [fuel, setFuel] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [sort, setSort] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const dq = useDebounced(q)
  const dmin = useDebounced(min)
  const dmax = useDebounced(max)

  const filters: LotFilters = {
    phase: tab,
    q: dq || undefined,
    brand: brand || undefined,
    fuel: fuel || undefined,
    minPriceCents: parseMoney(dmin) ?? undefined,
    maxPriceCents: parseMoney(dmax) ?? undefined,
    sort: sort || undefined,
  }

  const facets = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 60_000 })
  const received = useRef(Date.now())
  const lots = useQuery({
    queryKey: ['lots', filters, user?.id ?? null],
    queryFn: async () => {
      const r = await api.lots(filters)
      received.current = Date.now()
      return r
    },
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  })
  useLiveStream(undefined, [['lots']])

  const activeFilters = [brand, fuel, min, max, sort].filter(Boolean).length

  return (
    <>
      <section className="bg-hero text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr] md:py-20">
          <div>
            <span className="accent-bar mb-5" />
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Leilão de carros
              <br />
              <span className="text-accent">ao vivo</span>, com histórico
              <br />
              que ninguém adultera.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/70">
              Dê lances em tempo real, acompanhe se você está ganhando e confira a auditoria pública de cada lote, sem
              precisar de login.
            </p>
            {!user && (
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/cadastro" className="btn-hero">
                  Criar conta grátis
                </Link>
                <Link to="/entrar" className="btn border border-white/25 text-white hover:bg-white/10">
                  Já tenho conta
                </Link>
              </div>
            )}
          </div>
          <ul className="grid gap-3 self-end text-sm">
            {[
              [Zap, 'Lances em tempo real', 'A sala atualiza sozinha, sem recarregar a página.'],
              [ShieldCheck, 'Auditoria pública', 'Cada lote tem histórico selado e verificável.'],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Zap
              return (
                <li key={t as string} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <I className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-bold">{t as string}</p>
                    <p className="text-white/65">{d as string}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <SectionTitle kicker="Vitrine" title="Lotes em leilão" />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="tablist" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  tab === t.id ? 'bg-primary text-white shadow' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10"
              placeholder="Buscar por marca ou modelo (ex.: Corolla)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar lotes"
            />
          </div>

          <button className="btn-outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {activeFilters > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{activeFilters}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="card mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label>
              <span className="label">Marca</span>
              <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Todas</option>
                {facets.data?.brands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Combustível</span>
              <select className="input" value={fuel} onChange={(e) => setFuel(e.target.value)}>
                <option value="">Todos</option>
                {facets.data?.fuels.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Preço mínimo (R$)</span>
              <input className="input" inputMode="decimal" placeholder="0" value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
            <label>
              <span className="label">Preço máximo (R$)</span>
              <input className="input" inputMode="decimal" placeholder="sem limite" value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
            <label>
              <span className="label">Ordenar por</span>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {activeFilters > 0 && (
              <button
                className="btn-ghost justify-self-start sm:col-span-2 lg:col-span-5"
                onClick={() => {
                  setBrand('')
                  setFuel('')
                  setMin('')
                  setMax('')
                  setSort('')
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {lots.isLoading ? (
          <PageLoader label="Carregando lotes…" />
        ) : lots.isError ? (
          <ErrorBox error={lots.error} retry={() => lots.refetch()} />
        ) : lots.data!.items.length === 0 ? (
          <Empty title="Nenhum lote encontrado">
            {dq || activeFilters
              ? 'Tente ajustar a busca ou limpar os filtros.'
              : tab === 'live'
                ? 'Não há leilões ao vivo agora. Veja os agendados ou volte em instantes.'
                : tab === 'scheduled'
                  ? 'Nenhum leilão agendado no momento.'
                  : 'Ainda não há leilões encerrados.'}
          </Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lots.data!.items.map((lot) => (
              <LotCard key={lot.id} lot={lot} receivedAt={received.current} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
