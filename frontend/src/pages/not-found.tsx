import { Link } from 'react-router-dom'

import { SiteHeader } from '@/components/layout/site-header'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="text-center">
          <p className="font-display text-6xl font-light text-hairline-strong">404</p>
          <h1 className="mt-4 font-sans text-2xl font-medium text-ink">Page not found</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            The page you are looking for does not exist or has moved.
          </p>
          <Button asChild className="mt-8">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}