import { Plus, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function StreamsPage() {
  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl">Streams</h1>
          <p className="mt-2 max-w-xl text-body">
            Connect a video source, draw your counting lines, and watch traffic flow in real time.
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4" />
          Connect a stream
        </Button>
      </div>

      <div className="mt-10">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-20 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-muted">
            <Video className="h-5 w-5" />
          </span>
          <h2 className="mt-5 font-sans text-lg font-medium text-ink">No streams yet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Streams you connect will appear here with their live counters and status.
          </p>
        </div>
      </div>
    </div>
  )
}