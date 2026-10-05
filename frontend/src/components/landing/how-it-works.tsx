import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

const steps = [
  {
    number: '01',
    title: 'Connect a stream',
    body: 'Add the playlist URL for a camera or encoder. Nothing to install on the edge.',
  },
  {
    number: '02',
    title: 'Draw your lines',
    body: 'Mark a region of interest, then draw one or more directional counting lines over the road.',
  },
  {
    number: '03',
    title: 'Read the flow',
    body: 'Counters update live. Review sessions later to see how traffic moved over time.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-hairline bg-canvas-soft">
      <div className="container py-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            How it works
          </p>
          <h2 className="display mt-4 text-4xl text-balance">From stream to count in three steps.</h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              <span className="font-display text-5xl font-light text-hairline-strong">
                {step.number}
              </span>
              <h3 className="mt-4 font-sans text-lg font-medium text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              {index < steps.length - 1 && (
                <span className="absolute right-0 top-6 hidden h-px w-8 bg-hairline-strong md:block" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/register">Create your workspace</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">I already have an account</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}