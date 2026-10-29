import { Gavel, User as UserIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Field, Spinner, useToast } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import type { Role } from '@/lib/types'

const DEMO = import.meta.env.VITE_SHOW_DEMO !== 'false'
const DEMO_ACCOUNTS = [
  { label: 'Entrar como Leiloeiro', email: 'leiloeiro@leilao.dev' },
  { label: 'Entrar como Cliente 1', email: 'cliente1@leilao.dev' },
  { label: 'Entrar como Cliente 2', email: 'cliente2@leilao.dev' },
]
const DEMO_PASSWORD = 'Senha@123'

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1.1fr] md:py-16">
      <div className="hidden rounded-3xl bg-hero p-8 text-white md:flex md:flex-col md:justify-end">
        <span className="accent-bar mb-4" />
        <h1 className="text-3xl font-extrabold leading-tight">
          Dê lances com <span className="text-accent">confiança</span>.
        </h1>
        <p className="mt-3 text-sm text-white/70">
          Saldo simulado, lances em tempo real e auditoria pública do histórico de cada lote.
        </p>
      </div>
      <div className="card-flat p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const from = (loc.state as { from?: string } | null)?.from ?? '/'

  const submit = async (e: string, p: string) => {
    setBusy(true)
    setError('')
    try {
      const u = await login(e, p)
      toast.success(`Bem-vindo, ${u.name.split(' ')[0]}!`)
      nav(from === '/' && u.role === 'auctioneer' ? '/painel' : from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Entrar" subtitle="Acesse sua conta para dar lances ou gerenciar seus lotes.">
      <form
        onSubmit={(ev: FormEvent) => {
          ev.preventDefault()
          void submit(email, password)
        }}
        className="space-y-4"
      >
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-ink" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Entrar
        </button>
      </form>

      {DEMO && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="caps mb-3">Contas de demonstração</p>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} className="btn-outline justify-start" disabled={busy} onClick={() => submit(a.email, DEMO_PASSWORD)}>
                {a.email.startsWith('leiloeiro') ? <Gavel className="h-4 w-4 text-accent" /> : <UserIcon className="h-4 w-4 text-primary" />}
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Não tem conta?{' '}
        <Link to="/cadastro" className="font-semibold text-primary hover:underline">
          Cadastre-se
        </Link>
      </p>
    </Shell>
  )
}

export function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [role, setRole] = useState<Role>('bidder')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    setError('')
    try {
      const u = await register({ name, email, password, role })
      toast.success('Conta criada com sucesso!')
      nav(u.role === 'auctioneer' ? '/painel' : '/carteira', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Criar conta" subtitle="Escolha como você vai usar a plataforma.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Perfil">
          {(
            [
              ['bidder', 'Licitante', 'Deposita saldo, dá lances e arremata.'],
              ['auctioneer', 'Leiloeiro', 'Cria e gerencia os próprios lotes.'],
            ] as const
          ).map(([id, t, d]) => (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={role === id}
              onClick={() => setRole(id)}
              className={`rounded-xl border p-3 text-left transition ${
                role === id ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-3'
              }`}
            >
              <p className="caps !text-ink">{t}</p>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </button>
          ))}
        </div>
        <Field label="Nome completo">
          <input className="input" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-ink" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} Criar conta
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-semibold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </Shell>
  )
}
