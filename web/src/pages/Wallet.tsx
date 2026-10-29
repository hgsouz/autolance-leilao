import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Lock, PiggyBank, Unlock, Wallet as WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { Empty, ErrorBox, Field, MoneyInput, PageLoader, SectionTitle, Spinner, useToast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { brl, dateTime } from '@/lib/format'
import { useLiveStream } from '@/lib/hooks'

const TYPE_LABEL = {
  deposit: 'Depósito',
  purchase: 'Arremate',
  sale: 'Venda',
  release: 'Estorno',
} as const

export default function Wallet() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [amount, setAmount] = useState<number | null>(null)
  const [fieldKey, setFieldKey] = useState(0)
  const [error, setError] = useState('')

  const q = useQuery({ queryKey: ['wallet', user?.id], queryFn: api.wallet, refetchInterval: 15_000 })
  useLiveStream(undefined, [['wallet']])

  const dep = useMutation({
    mutationFn: (c: number) => api.deposit(c),
    onSuccess: (w, c) => {
      qc.setQueryData(['wallet', user?.id], w)
      toast.success(`Depósito de ${brl(c)} realizado (saldo simulado).`)
      setAmount(null)
      setFieldKey((k) => k + 1)
      setError('')
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Não foi possível depositar.'),
  })

  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const w = q.data

  const cards = [
    { label: 'Saldo total', value: w.totalCents, icon: PiggyBank, hint: 'Tudo o que você depositou, menos arremates pagos.' },
    { label: 'Comprometido', value: w.committedCents, icon: Lock, hint: 'Soma dos lances em que você está liderando agora.', accent: true },
    { label: 'Disponível', value: w.availableCents, icon: Unlock, hint: 'Total − comprometido. É o que você pode usar em novos lances.', strong: true },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionTitle kicker="Licitante" title="Minha carteira" />

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border p-5 ${c.strong ? 'border-transparent bg-hero text-white' : 'card-flat'}`}>
            <div className="flex items-center justify-between">
              <p className={`caps ${c.strong ? '!text-white/70' : ''}`}>{c.label}</p>
              <c.icon className={`h-4 w-4 ${c.accent ? 'text-accent' : c.strong ? 'text-white/70' : 'text-primary'}`} />
            </div>
            <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{brl(c.value)}</p>
            <p className={`mt-2 text-xs ${c.strong ? 'text-white/60' : 'text-muted'}`}>{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <form
          className="card-flat h-fit p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!amount || amount <= 0) return setError('Informe um valor maior que zero.')
            dep.mutate(amount)
          }}
        >
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <WalletIcon className="h-5 w-5 text-primary" /> Depósito simulado
          </h2>
          <p className="mt-1 text-xs text-muted">Nenhum pagamento real é processado: o valor é creditado na hora.</p>
          <div className="mt-4 space-y-3">
            <Field label="Valor" error={error}>
              <MoneyInput key={fieldKey} valueCents={amount} onChange={(c) => { setAmount(c); setError('') }} placeholder="10.000,00" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {[5_000, 20_000, 100_000].map((v) => (
                <button type="button" key={v} className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => { setAmount(v * 100); setFieldKey((k) => k + 1); setError('') }}>
                  + {brl(v * 100)}
                </button>
              ))}
            </div>
            <button className="btn-primary w-full" disabled={dep.isPending}>
              {dep.isPending && <Spinner className="h-4 w-4" />} Depositar
            </button>
          </div>
        </form>

        <div className="card-flat p-5">
          <h2 className="text-lg font-extrabold">Movimentações</h2>
          {w.transactions.length === 0 ? (
            <div className="mt-4">
              <Empty title="Sem movimentações">Faça um depósito para começar a dar lances.</Empty>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {w.transactions.map((t) => {
                const positive = t.amountCents > 0
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${positive ? 'bg-primary-soft text-primary' : t.type === 'release' ? 'bg-surface-3 text-muted' : 'bg-accent-soft text-accent'}`}>
                      {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{TYPE_LABEL[t.type]}</p>
                      <p className="truncate text-xs text-muted">{t.note ?? ''}</p>
                      <p className="text-[11px] text-muted">{dateTime(t.createdAt)}</p>
                    </div>
                    <p className={`font-display text-base font-bold tabular-nums ${positive ? 'text-primary' : t.amountCents < 0 ? 'text-accent' : 'text-muted'}`}>
                      {t.amountCents === 0 ? '—' : `${positive ? '+' : ''}${brl(t.amountCents)}`}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
