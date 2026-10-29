const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlNoCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const brl = (cents: number) => brlFmt.format(cents / 100)
export const brlShort = (cents: number) => (cents % 100 === 0 ? brlNoCents.format(cents / 100) : brlFmt.format(cents / 100))

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const timeWithSeconds = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const shortHash = (h: string | null | undefined, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : '—')

/** "2d 03h", "03:12:45" ou "04:59", conforme o tempo restante. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${p(h)}h ${p(m)}m`
  if (h > 0) return `${p(h)}:${p(m)}:${p(s)}`
  return `${p(m)}:${p(s)}`
}

/** Valor para <input type="datetime-local"> no fuso local. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const FUEL_LABEL: Record<string, string> = { Gasolina: 'Gasolina / Flex' }
