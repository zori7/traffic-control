import { Activity, Gauge, History, Layers, Radio, Target } from 'lucide-react'

import { Card } from '@/components/ui/card'

const features = [
  {
    icon: Target,
    title: 'Directional line counting',
    body: 'Draw a line, set the direction, and count only the traffic that crosses it the way you mean.',
  },
  {
    icon: Layers,
    title: 'Multi-line & region of interest',
    body: 'Run several lines at once, and confine detection to a region so off-road movement is ignored.',
  },
  {
    icon: Activity,
    title: 'Live counters',
    body: 'Totals update the moment a vehicle crosses — split by direction and by class.',
  },
  {
    icon: Radio,
    title: 'Any network stream',
    body: 'Point it at an HLS playlist and go. RTSP and other ffmpeg sources work the same way.',
  },
  {
    icon: Gauge,
    title: 'Health at a glance',
    body: 'Frame rate, inference time, dropped frames and worker state, right beside the video.',
  },
  {
    icon: History,
    title: 'Session history',
    body: 'Every counting session is retained, so you can review and export totals after the fact.',
  },
]

export function Features() {
  return (
    <section id="features" className="border-t border-hairline bg-canvas">
      <div className="container py-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Capabilities
          </p>
          <h2 className="display mt-4 text-4xl text-balance">
            Built for accurate counts, not just detections.
          </h2>
          <p className="mt-4 text-body">
            Detection is only half the job. Traffic Control turns tracks into counts you can act on.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group p-6 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-lift"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-canvas-soft text-ink">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-sans text-lg font-medium text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}