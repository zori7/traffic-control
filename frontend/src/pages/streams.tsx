import { useQuery } from '@tanstack/react-query'
import { Plus, Search, TriangleAlert, Video, Waypoints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchStreams } from '@/features/streams/api'
import { StatusBadge } from '@/features/streams/status-badge'
import { StreamFormDialog } from '@/features/streams/stream-form-dialog'
import type { Stream, StreamStatus } from '@/features/streams/types'
import { formatRelativeTime, sourceHost } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS: { value: 'all' | StreamStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'idle', label: 'Idle' },
  { value: 'running', label: 'Running' },
  { value: 'error', label: 'Error' },
]

export function StreamsPage() {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | StreamStatus>('all')

  const streamsQuery = useQuery({ queryKey: ['streams'], queryFn: fetchStreams })
  const streams = useMemo(() => streamsQuery.data ?? [], [streamsQuery.data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return streams.filter((stream) => {
      if (status !== 'all' && stream.status !== status) return false
      if (!term) return true
      return (
        stream.name.toLowerCase().includes(term) ||
        stream.source_url.toLowerCase().includes(term) ||
        (stream.description ?? '').toLowerCase().includes(term)
      )
    })
  }, [streams, search, status])

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl">Streams</h1>
          <p className="mt-2 max-w-xl text-body">
            Connect a video source, draw your counting lines, and watch traffic flow in real time.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Connect a stream
        </Button>
      </div>

      {streams.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search streams"
              className="pl-10"
              aria-label="Search streams"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={cn(
                  'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                  status === filter.value
                    ? 'bg-surface-strong text-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {streamsQuery.isLoading ? (
          <StreamGridSkeleton />
        ) : streamsQuery.isError ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-16 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-error">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-sans text-lg font-medium text-ink">
              Couldn&apos;t load streams
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Something went wrong talking to the server.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => streamsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : streams.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-16 text-center">
            <p className="text-sm text-muted">No streams match your search.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </div>

      <StreamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(stream) => navigate(`/streams/${stream.id}`)}
      />
    </div>
  )
}

function StreamCard({ stream }: { stream: Stream }) {
  return (
    <Link
      to={`/streams/${stream.id}`}
      className="flex min-h-[176px] flex-col rounded-xl border border-hairline bg-surface p-5 shadow-soft transition hover:border-hairline-strong hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-sans text-lg font-medium text-ink">{stream.name}</h2>
          <p className="mt-1 truncate text-sm text-muted">{sourceHost(stream.source_url)}</p>
        </div>
        <StatusBadge status={stream.status} />
      </div>

      {stream.description && (
        <p className="mt-3 line-clamp-2 text-sm text-body">{stream.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Waypoints className="h-3.5 w-3.5" />
          {stream.line_count} {stream.line_count === 1 ? 'line' : 'lines'}
        </span>
        <span>Updated {formatRelativeTime(stream.updated_at)}</span>
      </div>
    </Link>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-20 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-muted">
        <Video className="h-5 w-5" />
      </span>
      <h2 className="mt-5 font-sans text-lg font-medium text-ink">No streams yet</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Connect your first video source to start counting. Streams you add appear here with their
        counters and status.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        Connect a stream
      </Button>
    </div>
  )
}

function StreamGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-hairline bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-5 h-4 w-24" />
        </div>
      ))}
    </div>
  )
}
