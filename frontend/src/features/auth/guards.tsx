import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { FullScreenLoader } from '@/components/layout/full-screen-loader'

import { useAuth } from './auth-context'

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullScreenLoader />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}

export function RedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <FullScreenLoader />
  if (isAuthenticated) return <Navigate to="/streams" replace />
  return <Outlet />
}