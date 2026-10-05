import { Link } from 'react-router-dom'

import { TrafficVisualization } from '@/components/landing/traffic-visualization'
import { TypedText } from '@/components/landing/typed-text'
import { SiteHeader } from '@/components/layout/site-header'
import { Button } from '@/components/ui/button'
import { CtaBand } from '@/components/landing/cta-band'
import { Features } from '@/components/landing/features'
import { HowItWorks } from '@/components/landing/how-it-works'
import { SiteFooter } from '@/components/landing/site-footer'

const heroStats = [
  { value: '4+', label: 'Vehicle classes' },
  { value: '<1s', label: 'Counter latency' },
  { value: 'HLS', label: 'Stream input' },
]

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="orb -left-24 top-8 h-80 w-80 bg-gradient-mint animate-orb-drift" />
          <div className="orb right-0 top-24 h-96 w-96 bg-gradient-lavender animate-orb-drift-alt" />
          <div className="orb bottom-0 left-1/3 h-72 w-72 bg-gradient-peach animate-orb-drift" />

          <div className="container relative grid gap-14 py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Real-time traffic intelligence
              </span>

              <h1 className="display mt-6 text-5xl text-balance sm:text-6xl">
                Count every vehicle from any stream.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
                Draw a line and a direction. Traffic Control tracks{' '}
                <TypedText
                  className="font-medium text-ink"
                  phrases={['cars', 'trucks', 'buses', 'motorcycles']}
                />{' '}
                as they cross it — with live counts by direction and class.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/register">Start counting</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>

              <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
                {heroStats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {stat.label}
                    </dt>
                    <dd className="mt-1 font-display text-3xl font-light text-ink">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <TrafficVisualization />
          </div>
        </section>

        <Features />
        <HowItWorks />
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  )
}