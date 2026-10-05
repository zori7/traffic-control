import { Link } from 'react-router-dom'

import { Logo } from '@/components/layout/logo'

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-canvas">
      <div className="container flex flex-col gap-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href="#features" className="transition-colors hover:text-ink">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-ink">
            How it works
          </a>
          <Link to="/login" className="transition-colors hover:text-ink">
            Sign in
          </Link>
          <Link to="/register" className="transition-colors hover:text-ink">
            Get started
          </Link>
        </nav>
      </div>
      <div className="container border-t border-hairline py-6 text-xs text-muted-soft">
        © {new Date().getFullYear()} Traffic Control. Real-time vision for road networks.
      </div>
    </footer>
  )
}