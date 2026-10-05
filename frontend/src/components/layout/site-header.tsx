import { Link } from 'react-router-dom'

import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'

import { Logo } from './logo'

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
]

export function SiteHeader() {
  const { isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-[15px] font-medium text-muted transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link to="/streams">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}