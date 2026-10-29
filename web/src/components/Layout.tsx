import { Gavel, LogOut, Menu, Moon, ShieldCheck, Sun, Wallet as WalletIcon, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#04193b] ring-1 ring-white/10">
        <Gavel className="h-5 w-5 text-white" />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />
      </span>
      <span className={`font-display text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        Auto<span className="text-accent">Lance</span>
      </span>
    </span>
  )
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-3 hover:text-ink'
  }`

export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  const links = [
    { to: '/', label: 'Leilões', end: true },
    ...(user?.role === 'bidder'
      ? [
          { to: '/meus-arremates', label: 'Meus arremates', end: false },
          { to: '/carteira', label: 'Carteira', end: false },
        ]
      : []),
    ...(user?.role === 'auctioneer' ? [{ to: '/painel', label: 'Painel do leiloeiro', end: false }] : []),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="AutoLance — início" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="btn-ghost !p-2" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {user ? (
              <div className="hidden items-center gap-2 md:flex">
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-[11px] text-muted">{user.role === 'auctioneer' ? 'Leiloeiro' : 'Licitante'}</p>
                </div>
                <button
                  className="btn-ghost !p-2"
                  aria-label="Sair"
                  onClick={() => {
                    logout()
                    nav('/')
                  }}
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link to="/entrar" state={{ from: loc.pathname }} className="btn-ghost">
                  Entrar
                </Link>
                <Link to="/cadastro" className="btn-primary">
                  Criar conta
                </Link>
              </div>
            )}

            <button className="btn-ghost !p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Principal (mobile)">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={() => setOpen(false)}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              {user ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs text-muted">{user.role === 'auctioneer' ? 'Leiloeiro' : 'Licitante'}</p>
                  </div>
                  <button
                    className="btn-outline"
                    onClick={() => {
                      logout()
                      setOpen(false)
                      nav('/')
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link to="/entrar" className="btn-outline flex-1" onClick={() => setOpen(false)}>
                    Entrar
                  </Link>
                  <Link to="/cadastro" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                    Criar conta
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface-2">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-md text-xs">
              Leilão online de carros com lances em tempo real e histórico auditável por qualquer pessoa. Projeto de
              demonstração: o saldo é simulado e nenhum pagamento real é processado.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-4 w-4 text-primary" /> Histórico de lances selado com HMAC
            <WalletIcon className="ml-3 h-4 w-4 text-primary" /> Saldo simulado
          </p>
        </div>
      </footer>
    </div>
  )
}
