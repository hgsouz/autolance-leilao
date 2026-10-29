import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ApiError } from '@/lib/api'

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />
}

export function PageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted" role="status">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Algo deu errado.'
  return (
    <div className="card mx-auto my-10 max-w-lg p-6 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-accent" />
      <p className="text-sm text-ink">{msg}</p>
      {retry && (
        <button onClick={retry} className="btn-outline mt-4">
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card border-dashed px-6 py-14 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

export function SectionTitle({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="accent-bar mb-3" />
        {kicker && <p className="caps mb-1">{kicker}</p>}
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-accent">{error}</span>}
    </label>
  )
}

/** Campo de dinheiro: o usuário digita em reais; o valor controlado é sempre em centavos. */
export function MoneyInput({
  valueCents,
  onChange,
  placeholder = '0,00',
  id,
  disabled,
}: {
  valueCents: number | null
  onChange: (cents: number | null) => void
  placeholder?: string
  id?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(valueCents === null ? '' : fmtInput(valueCents))
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
        R$
      </span>
      <input
        id={id}
        className="input pl-10 tabular-nums"
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, '')
          setText(raw)
          onChange(parseMoney(raw))
        }}
        onBlur={() => {
          const c = parseMoney(text)
          setText(c === null ? '' : fmtInput(c))
        }}
      />
    </div>
  )
}

const fmtInput = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234,56" | "1234,56" | "1234.5" -> centavos */
export function parseMoney(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  let normalized: string
  if (t.includes(',')) normalized = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normalized = t.replace(/\./g, '')
  else normalized = t
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

// ---------- Toasts ----------

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  text: string
}
const ToastCtx = createContext<{ push: (kind: ToastKind, text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l, { id, kind, text }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4500)
  }, [])

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error'
                ? 'border-accent/40 bg-accent-soft text-ink'
                : t.kind === 'success'
                  ? 'border-primary/30 bg-primary-soft text-ink'
                  : 'border-line bg-surface text-ink'
            }`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            {t.kind === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            ) : t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))} aria-label="Fechar">
              <X className="h-4 w-4 text-muted" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast fora do ToastProvider')
  return {
    success: (t: string) => ctx.push('success', t),
    info: (t: string) => ctx.push('info', t),
    error: (e: unknown) => ctx.push('error', e instanceof ApiError || e instanceof Error ? e.message : String(e)),
  }
}

// ---------- Modal de confirmação ----------

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="card-flat w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
