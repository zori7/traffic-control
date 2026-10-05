import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'

export function CtaBand() {
  const { isAuthenticated } = useAuth()

  return (
    <section className="relative overflow-hidden border-t border-hairline bg-canvas">
      <div className="orb left-1/2 top-0 h-72 w-72 -translate-x-1/2 bg-gradient-sky animate-orb-drift" />
      <div className="container relative py-24 text-center">
        <h2 className="display mx-auto max-w-3xl text-4xl text-balance sm:text-5xl">
          Turn any camera into a traffic sensor.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-body">
          Set up a stream, draw a line, and start counting in minutes.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to={isAuthenticated ? '/streams' : '/register'}>
              {isAuthenticated ? 'Open dashboard' : 'Get started free'}
            </Link>
          </Button>
          {!isAuthenticated && (
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}