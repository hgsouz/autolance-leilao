import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Copy, Printer, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Logo } from '@/components/Layout'
import { VehiclePhoto } from '@/components/LotCard'
import { ErrorBox, PageLoader, useToast } from '@/components/ui'
import { api } from '@/lib/api'
import { brl, dateTime, shortHash } from '@/lib/format'

export default function ReceiptPage() {
  const { code = '' } = useParams()
  const toast = useToast()
  const q = useQuery({ queryKey: ['receipt', code], queryFn: () => api.receipt(code), retry: false })

  if (q.isLoading) return <PageLoader label="Verificando comprovante…" />
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <ErrorBox error={q.error} />
        <p className="text-center">
          <Link to="/" className="btn-outline">
            Ir para a vitrine
          </Link>
        </p>
      </div>
    )
  }
  const r = q.data

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="card-flat overflow-hidden shadow-sm">
        <div className="flex items-center justify-between bg-hero px-6 py-5 text-white">
          <Logo light />
          <p className="caps !text-white/60">Comprovante de arremate</p>
        </div>

        <div className="p-6 sm:p-8">
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${r.valid ? 'bg-primary-soft text-ink' : 'bg-accent-soft text-ink'}`}
            role="status"
          >
            {r.valid ? <BadgeCheck className="h-6 w-6 text-primary" /> : <ShieldAlert className="h-6 w-6 text-accent" />}
            {r.valid ? 'Comprovante autêntico: selo e histórico de lances verificados.' : 'ATENÇÃO: este comprovante NÃO passou na verificação de integridade.'}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]">
            <VehiclePhoto lot={{ ...r, imageUrl: r.imageUrl }} className="aspect-[4/3] rounded-xl" />
            <div>
              <p className="caps">
                {r.attributes.brand} · {r.attributes.modelYear}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold">{r.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {r.attributes.fuel} · FIPE {r.attributes.codeFipe}
              </p>
              <p className="mt-4 caps">Valor do arremate</p>
              <p className="font-display text-4xl font-extrabold tabular-nums">{brl(r.amountCents)}</p>
            </div>
          </div>

          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Código do comprovante', r.code],
              ['Emitido em', dateTime(r.issuedAt)],
              ['Arrematante', r.winnerAlias],
              ['Leiloeiro', r.auctioneerAlias],
              ['Lances no lote', String(r.bidCount)],
              ['Selo do histórico', shortHash(r.headHash, 14)],
            ].map(([k, v]) => (
              <div key={k} className="card p-3">
                <dt className="caps">{k}</dt>
                <dd className="mt-1 break-all font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">
            Por privacidade, o comprovante identifica as partes apenas por apelidos (sem nome, e-mail ou outros dados pessoais).
          </p>

          <div className="no-print mt-6 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  toast.success('Link copiado!')
                } catch {
                  toast.info(window.location.href)
                }
              }}
            >
              <Copy className="h-4 w-4" /> Copiar link
            </button>
            <button className="btn-outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <Link to={`/auditoria/${r.lotId}`} className="btn-outline">
              Auditar o lote
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
