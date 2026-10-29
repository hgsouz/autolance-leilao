import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import type { Role } from '@/lib/types'
import { PageLoader } from './ui'

/** Exige login (e, opcionalmente, um papel). Quem não tem o papel volta para a vitrine. */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
