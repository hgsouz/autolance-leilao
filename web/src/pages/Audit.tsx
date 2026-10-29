import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, PageLoader } from '@/components/ui'
import { api } from '@/lib/api'
import { brl, dateTime, shortHash, timeWithSeconds } from '@/lib/format'
import { useLiveStream } from '@/lib/hooks'

export default function Audit() {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['audit', id], queryFn: () => api.audit(id), refetchInterval: 20_000 })
  useLiveStream(id, [['audit', id]])

  if (q.isLoading) return <PageLoader label="Verificando integridade…" />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const a = q.data
  const ok = a.integrity.ok
  const badSeqs = new Set(a.integrity.issues.map((i) => i.seq).filter((s): s is number => s !== undefined))

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to={`/lotes/${a.lotId}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Voltar ao lote
      </Link>

      <span className="accent-bar mb-3" />
      <p className="caps mb-1">Auditoria pública</p>
      <h1 className="text-2xl font-extrabold sm:text-3xl">{a.title}</h1>

      <div
        className={`mt-6 flex items-start gap-4 rounded-2xl border p-5 ${
          ok ? 'border-primary/40 bg-primary-soft' : 'border-accent/60 bg-accent-soft'
        }`}
        role="status"
      >
        {ok ? <ShieldCheck className="h-9 w-9 shrink-0 text-primary" /> : <ShieldAlert className="h-9 w-9 shrink-0 text-accent" />}
        <div>
          <p className="font-display text-xl font-extrabold">
            {ok ? 'Histórico íntegro' : 'Histórico ADULTERADO'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {ok
              ? `Os ${a.bidCount} lances foram recalculados do zero e todos conferem com o selo do servidor.`
              : 'A verificação encontrou inconsistências: o histórico foi alterado fora da aplicação. Detalhes abaixo.'}
          </p>
          <p className="mt-2 text-xs text-muted">Verificado agora em {dateTime(a.checkedAt)}</p>
        </div>
      </div>

      {!ok && (
        <ul className="mt-4 space-y-2" aria-label="Problemas encontrados">
          {a.integrity.issues.map((i, n) => (
            <li key={n} className="flex items-start gap-2 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-sm">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="card-flat mt-6 p-5">
        <h2 className="text-lg font-extrabold">Verificações realizadas</h2>
        <ul className="mt-3 space-y-2">
          {a.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
              <span className={c.ok ? '' : 'font-semibold'}>{c.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-flat mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">Histórico completo ({a.bidCount} lances)</h2>
          <p className="text-xs text-muted">
            Cabeça da cadeia: <code className="font-mono">{shortHash(a.headHash, 12)}</code>
          </p>
        </div>
        {a.bids.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Este lote não recebeu lances.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="caps border-b border-line">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Licitante</th>
                  <th className="py-2 pr-3">Valor</th>
                  <th className="py-2 pr-3">Horário</th>
                  <th className="py-2">Selo (HMAC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.bids.map((b) => (
                  <tr key={b.seq} className={badSeqs.has(b.seq) ? 'bg-accent-soft' : ''}>
                    <td className="py-2.5 pr-3 font-display font-bold text-numeral">{b.seq}</td>
                    <td className="py-2.5 pr-3 font-semibold">{b.alias}</td>
                    <td className="py-2.5 pr-3 font-bold tabular-nums">{brl(b.amountCents)}</td>
                    <td className="py-2.5 pr-3 text-muted">
                      {new Date(b.placedAt).toLocaleDateString('pt-BR')} {timeWithSeconds(b.placedAt)}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted" title={b.hash}>
                      {shortHash(b.hash, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          Licitantes aparecem apenas por um apelido que muda a cada lote, sem nome, e-mail ou qualquer dado pessoal.
        </p>
      </section>
    </div>
  )
}
