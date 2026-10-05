import { LogOut } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

import { Logo } from './logo'

const navItems = [{ to: '/streams', label: 'Streams' }]

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
      toast.success('Signed out')
      navigate('/login', { replace: true })
    } catch {
      toast.error('Could not sign out. Please try again.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo to="/streams" />
            <nav className="hidden items-center gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-3.5 py-2 text-[15px] font-medium transition-colors',
                      isActive ? 'bg-surface-strong text-ink' : 'text-muted hover:text-ink',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {user && (
              <span className="hidden rounded-full border border-hairline px-3 py-1.5 text-sm text-muted sm:inline-flex">
                {user.username}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}