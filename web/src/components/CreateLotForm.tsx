import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, DatabaseZap, ImageIcon, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Field, MoneyInput, Spinner, useToast } from '@/components/ui'
import { api } from '@/lib/api'
import { brl, toLocalInput } from '@/lib/format'
import type { CatalogItem, CatalogSource, Lot } from '@/lib/types'

const SOURCE_NOTE: Partial<Record<CatalogSource, string>> = {
  cache: 'Dados do cache local (API pública consultada recentemente).',
  'stale-cache': 'A API pública está instável: exibindo dados salvos anteriormente.',
  fallback: 'Catálogo de amostra offline (preços ilustrativos, não oficiais).',
}

export function CreateLotForm({ onCreated }: { onCreated: (lot: Lot) => void }) {
  const toast = useToast()
  const [useFallback, setUseFallback] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [starting, setStarting] = useState<number | null>(null)
  const [increment, setIncrement] = useState<number | null>(null)
  const [startNow, setStartNow] = useState(true)
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date(Date.now() + 3600_000)))
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(Date.now() + 24 * 3600_000)))
  const [formError, setFormError] = useState('')

  const brands = useQuery({ queryKey: ['cat-brands', useFallback], queryFn: () => api.brands(useFallback), retry: false })
  const models = useQuery({ queryKey: ['cat-models', brand], queryFn: () => api.models(brand), enabled: !!brand, retry: false })
  const years = useQuery({ queryKey: ['cat-years', brand, model], queryFn: () => api.years(brand, model), enabled: !!brand && !!model, retry: false })
  const vehicle = useQuery({
    queryKey: ['cat-vehicle', brand, model, year],
    queryFn: () => api.vehicle(brand, model, year),
    enabled: !!brand && !!model && !!year,
    retry: false,
  })
  const v = vehicle.data?.vehicle

  const filter = (items: CatalogItem[] | undefined, text: string) => {
    const t = text.trim().toLowerCase()
    return (items ?? []).filter((i) => !t || i.name.toLowerCase().includes(t)).slice(0, 400)
  }
  const brandItems = useMemo(() => filter(brands.data?.items, brandFilter), [brands.data, brandFilter])
  const modelItems = useMemo(() => filter(models.data?.items, modelFilter), [models.data, modelFilter])

  const imageSuggestion = useMutation({
    mutationFn: () => api.image(v!.brand, v!.model),
    onSuccess: (r) => {
      if (r.url) {
        setImageUrl(r.url)
        toast.info('Imagem sugerida aplicada. Confira o preview e troque a URL se preferir.')
      } else toast.info('Nenhuma imagem encontrada automaticamente. Cole a URL de uma foto.')
    },
    onError: () => toast.info('Sugestão de imagem indisponível agora. Cole a URL de uma foto.'),
  })

  const create = useMutation({
    mutationFn: () =>
      api.createLot({
        brandCode: brand,
        modelCode: model,
        yearCode: year,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        startingBidCents: starting!,
        minIncrementCents: increment!,
        startsAt: startNow ? undefined : new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    onSuccess: (lot) => {
      toast.success('Lote criado!')
      onCreated(lot)
    },
    onError: (e: unknown) => setFormError(e instanceof Error ? e.message : 'Não foi possível criar o lote.'),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!v) return setFormError('Escolha marca, modelo e ano do veículo.')
    if (!starting || starting <= 0) return setFormError('Informe o lance inicial.')
    if (!increment || increment <= 0) return setFormError('Informe o incremento mínimo.')
    const end = new Date(endsAt)
    const start = startNow ? new Date() : new Date(startsAt)
    if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return setFormError('Datas inválidas.')
    if (end.getTime() <= Date.now()) return setFormError('O término precisa estar no futuro.')
    if (end.getTime() - start.getTime() < 60_000) return setFormError('O lote precisa durar pelo menos 1 minuto (término depois do início).')
    create.mutate()
  }

  const catalogDown = brands.isError

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* 1. Veículo */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-extrabold">
            <Search className="h-4 w-4 text-primary" /> 1. Buscar veículo na API pública (Tabela FIPE)
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
            <input
              type="checkbox"
              checked={useFallback}
              onChange={(e) => {
                setUseFallback(e.target.checked)
                setBrand('')
                setModel('')
                setYear('')
              }}
            />
            Usar catálogo de amostra (offline)
          </label>
        </div>

        {catalogDown && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-accent/50 bg-accent-soft px-4 py-3 text-sm" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="font-semibold">A API pública de veículos está indisponível.</p>
              <p className="text-muted">A vitrine e os lotes existentes continuam funcionando. Tente de novo ou use o catálogo de amostra.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-outline !py-1.5 text-xs" onClick={() => brands.refetch()}>
                  Tentar novamente
                </button>
                <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => setUseFallback(true)}>
                  <DatabaseZap className="h-3.5 w-3.5" /> Usar catálogo de amostra
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <span className="label">Marca</span>
            <input className="input mb-2" placeholder="Filtrar marcas…" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} disabled={brands.isLoading || catalogDown} />
            <select
              className="input"
              size={6}
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value)
                setModel('')
                setYear('')
                setModelFilter('')
              }}
              aria-label="Marca"
            >
              {brands.isLoading && <option disabled>Carregando…</option>}
              {brandItems.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Modelo</span>
            <input className="input mb-2" placeholder="Filtrar modelos…" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} disabled={!brand} />
            <select
              className="input"
              size={6}
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setYear('')
              }}
              disabled={!brand}
              aria-label="Modelo"
            >
              {models.isLoading && <option disabled>Carregando…</option>}
              {models.isError && <option disabled>Falha ao carregar modelos</option>}
              {modelItems.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Ano / combustível</span>
            <div className="mb-2 h-[42px]" />
            <select className="input" size={6} value={year} onChange={(e) => setYear(e.target.value)} disabled={!model} aria-label="Ano">
              {years.isLoading && <option disabled>Carregando…</option>}
              {years.isError && <option disabled>Falha ao carregar anos</option>}
              {years.data?.items.map((y) => (
                <option key={y.code} value={y.code}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(brands.data && SOURCE_NOTE[brands.data.source]) && (
          <p className="mt-3 text-xs text-muted">{SOURCE_NOTE[brands.data.source]}</p>
        )}

        {year && vehicle.isLoading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" /> Buscando ficha do veículo…
          </p>
        )}
        {vehicle.isError && (
          <p className="mt-4 text-sm text-accent" role="alert">
            {(vehicle.error as Error).message}
          </p>
        )}
        {v && (
          <div className="mt-4 grid gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm sm:grid-cols-4">
            <div><p className="caps">Veículo</p><p className="font-bold">{v.brand} {v.model}</p></div>
            <div><p className="caps">Ano</p><p className="font-bold">{v.modelYear}</p></div>
            <div><p className="caps">Combustível</p><p className="font-bold">{v.fuel}</p></div>
            <div><p className="caps">Valor FIPE ({v.referenceMonth})</p><p className="font-bold">{brl(v.fipePriceCents)}</p></div>
          </div>
        )}
      </section>

      {/* 2. Dados do lote */}
      <section className="card space-y-4 p-5">
        <h3 className="text-base font-extrabold">2. Dados do lote</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título" hint={v ? `Deixe em branco para usar “${v.brand} ${v.model} ${v.modelYear}”.` : undefined}>
            <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="URL da imagem">
            <div className="flex gap-2">
              <input className="input" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              <button type="button" className="btn-outline shrink-0" disabled={!v || imageSuggestion.isPending} onClick={() => imageSuggestion.mutate()} title="Sugerir imagem automaticamente">
                {imageSuggestion.isPending ? <Spinner className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                <span className="hidden sm:inline">Sugerir</span>
              </button>
            </div>
          </Field>
        </div>
        {imageUrl && (
          <img src={imageUrl} alt="Pré-visualização" referrerPolicy="no-referrer" className="h-36 rounded-xl border border-line object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} onLoad={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'block')} />
        )}
        <Field label="Descrição (opcional)">
          <textarea className="input min-h-24" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Lance inicial" hint="O primeiro lance deve ser maior ou igual a este valor.">
            <MoneyInput valueCents={starting} onChange={setStarting} placeholder="50.000,00" />
          </Field>
          <Field label="Incremento mínimo" hint="Cada novo lance deve superar o atual em pelo menos este valor.">
            <MoneyInput valueCents={increment} onChange={setIncrement} placeholder="500,00" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="label">Início</span>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} /> Iniciar agora
            </label>
            <input type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={startNow} aria-label="Início" />
          </div>
          <div>
            <span className="label">Término</span>
            <div className="mb-2 h-5" />
            <input type="datetime-local" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-label="Término" />
            <span className="mt-1 block text-xs text-muted">Lances nos últimos 2 minutos prorrogam o término em +2 minutos.</span>
          </div>
        </div>
      </section>

      {formError && (
        <p className="rounded-xl border border-accent/50 bg-accent-soft px-4 py-3 text-sm font-medium" role="alert">
          {formError}
        </p>
      )}
      <button className="btn-primary" disabled={create.isPending}>
        {create.isPending && <Spinner className="h-4 w-4" />} Publicar lote
      </button>
    </form>
  )
}
