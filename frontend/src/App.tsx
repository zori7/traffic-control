import { Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { AuthProvider } from '@/features/auth/auth-context'
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/guards'
import { LandingPage } from '@/pages/landing'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { RegisterPage } from '@/pages/register'
import { StreamsPage } from '@/pages/streams'
import { StreamAnalyticsPage } from '@/pages/stream-analytics'
import { StreamDetailPage } from '@/pages/stream-detail'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/streams" element={<StreamsPage />} />
            <Route path="/streams/:id" element={<StreamDetailPage />} />
            <Route path="/streams/:id/analytics" element={<StreamAnalyticsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}