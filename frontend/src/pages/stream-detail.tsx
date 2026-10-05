import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2, TriangleAlert, Waypoints } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { deleteLine, deleteStream, fetchLines, fetchStream } from '@/features/streams/api'
import { ConfirmDialog } from '@/features/streams/confirm-dialog'
import { HlsPlayer, type Resolution } from '@/features/streams/hls-player'
import { StatusBadge } from '@/features/streams/status-badge'
import { StreamFormDialog } from '@/features/streams/stream-form-dialog'
import { ApiError } from '@/lib/api'
import { formatRelativeTime, sourceHost } from '@/lib/format'

export function StreamDetailPage() {
  const params = useParams()
  const streamId = Number(params.id)
  const validId = Number.isInteger(streamId) && streamId > 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)

  const streamQuery = useQuery({
    queryKey: ['streams', streamId],
    queryFn: () => fetchStream(streamId),
    enabled: validId,
  })
  const linesQuery = useQuery({
    queryKey: ['streams', streamId, 'lines'],
    queryFn: () => fetchLines(streamId),
    enabled: validId,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteStream(streamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      toast.success('Stream deleted')
      navigate('/streams')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the stream')
    },
  })

  const deleteLineMutation = useMutation({
    mutationFn: deleteLine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'lines'] })
      queryClient.invalidateQueries({ queryKey: ['streams', streamId] })
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      toast.success('Line removed')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the line')
    },
  })

  if (streamQuery.isLoading) return <DetailSkeleton />

  const stream = streamQuery.data
  if (streamQuery.isError || !stream) {
    const notFound = streamQuery.error instanceof ApiError && streamQuery.error.status === 404
    return (
      <div className="container flex flex-col items-center py-24 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-muted">
          <TriangleAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-5 font-sans text-xl font-medium text-ink">
          {notFound ? 'Stream not found' : "Couldn't load this stream"}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {notFound
            ? 'It may have been deleted, or it belongs to another account.'
            : 'Something went wrong talking to the server.'}
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/streams">Back to streams</Link>
          </Button>
          {!notFound && <Button onClick={() => streamQuery.refetch()}>Try again</Button>}
        </div>
      </div>
    )
  }

  const lines = linesQuery.data ?? []

  return (
    <div className="container py-10">
      <Link
        to="/streams"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        All streams
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-display text-4xl font-light text-ink">{stream.name}</h1>
            <StatusBadge status={stream.status} />
            <Badge variant="outline">{stream.source_kind.toUpperCase()}</Badge>
          </div>
          {stream.description ? (
            <p className="mt-2 max-w-2xl text-body">{stream.description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Added {formatRelativeTime(stream.created_at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Live source</CardTitle>
                <CardDescription>The raw feed as received from the camera.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <HlsPlayer src={stream.source_url} onResolution={setResolution} />
              <p className="mt-3 truncate text-xs text-muted">{stream.source_url}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>Worker telemetry appears once counting starts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <StatusRow label="State">
                <StatusBadge status={stream.status} />
              </StatusRow>
              <StatusRow label="Resolution">
                {resolution ? `${resolution.width} × ${resolution.height}` : '—'}
              </StatusRow>
              <StatusRow label="Frame rate">—</StatusRow>
              <StatusRow label="Frames processed">—</StatusRow>
              <StatusRow label="Latency">—</StatusRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <StatusRow label="Host">{sourceHost(stream.source_url)}</StatusRow>
              <StatusRow label="Format">{stream.source_kind.toUpperCase()}</StatusRow>
              <StatusRow label="Updated">{formatRelativeTime(stream.updated_at)}</StatusRow>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-2xl">Counting lines</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-body">
              Each line runs along a lane. Vehicles count as they enter from the line&apos;s first
              point; the arrow shows the travel direction.
            </p>
          </div>
          <Button
            variant="outline"
            disabled
            title="Line drawing arrives with the counting engine"
          >
            <Waypoints className="h-4 w-4" />
            Draw line
          </Button>
        </div>

        <div className="mt-5">
          {linesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-12 text-center">
              <p className="font-sans text-sm font-medium text-ink">No lines yet</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                Lines drawn on the video will be listed here with their class filters.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center gap-4 rounded-xl border border-hairline bg-surface px-4 py-3"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: line.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[15px] font-medium text-ink">
                      {line.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {line.points.length} points · {line.classes.join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${line.name}`}
                    disabled={deleteLineMutation.isPending}
                    onClick={() => deleteLineMutation.mutate(line.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <StreamFormDialog open={editOpen} onOpenChange={setEditOpen} stream={stream} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete stream?"
        description={`"${stream.name}" and its counting lines will be permanently removed. This can't be undone.`}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{children}</span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="container py-10">
      <Skeleton className="h-4 w-24" />
      <div className="mt-4 flex items-center justify-between gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
