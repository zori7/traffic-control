import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Play,
  Square,
  Trash2,
  TriangleAlert,
  Waypoints,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AnimatedNumber } from '@/components/animated-number'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  deleteLine,
  deleteStream,
  fetchCounts,
  fetchLines,
  fetchPlayback,
  fetchStatus,
  fetchStream,
  startStream,
  stopStream,
} from '@/features/streams/api'
import { ConfirmDialog } from '@/features/streams/confirm-dialog'
import { FpsSparkline } from '@/features/streams/fps-sparkline'
import { HlsPlayer, type Resolution } from '@/features/streams/hls-player'
import { OverlayEditor } from '@/features/streams/overlay-editor'
import { StatusBadge } from '@/features/streams/status-badge'
import { StreamFormDialog } from '@/features/streams/stream-form-dialog'
import { feedKey, useStreamRealtime } from '@/features/streams/use-stream-realtime'
import type { Counters, StreamStatus, WorkerStatus } from '@/features/streams/types'
import { ApiError } from '@/lib/api'
import {
  formatDuration,
  formatRelativeFromSeconds,
  formatRelativeTime,
  sourceHost,
} from '@/lib/format'
import { cn } from '@/lib/utils'

const ACTIVE_STATES = new Set(['starting', 'running', 'stopping'])

export function StreamDetailPage() {
  const params = useParams()
  const streamId = Number(params.id)
  const validId = Number.isInteger(streamId) && streamId > 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [view, setView] = useState<'source' | 'annotated'>('source')

  // Live channel: pushes status + counters into the query cache while connected.
  const { connected, fpsHistory, feed } = useStreamRealtime(streamId, validId)

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
  const statusQuery = useQuery({
    queryKey: ['streams', streamId, 'status'],
    queryFn: () => fetchStatus(streamId),
    enabled: validId,
    refetchInterval: (query) => {
      if (connected) return false
      const state = query.state.data?.state
      return state && ACTIVE_STATES.has(state) ? 1500 : 4000
    },
  })
  const liveState = statusQuery.data?.state ?? streamQuery.data?.status ?? 'idle'
  const playbackQuery = useQuery({
    queryKey: ['streams', streamId, 'playback'],
    queryFn: () => fetchPlayback(streamId),
    enabled: validId,
    staleTime: 5 * 60 * 1000,
  })
  const countsQuery = useQuery({
    queryKey: ['streams', streamId, 'counts'],
    queryFn: () => fetchCounts(streamId),
    enabled: validId,
    refetchInterval: () =>
      connected && ACTIVE_STATES.has(liveState) ? false : liveState === 'running' ? 3000 : 5000,
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

  const startMutation = useMutation({
    mutationFn: () => startStream(streamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'status'] })
      queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'playback'] })
      queryClient.invalidateQueries({ queryKey: ['streams', streamId] })
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      toast.success('Counting started')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not start counting'),
  })

  const stopMutation = useMutation({
    mutationFn: () => stopStream(streamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'status'] })
      queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'counts'] })
      queryClient.invalidateQueries({ queryKey: ['streams', streamId] })
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      toast.success('Counting stopped')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not stop counting'),
  })

  // The view follows the worker: annotated once its HLS output exists, source
  // otherwise. A manual toggle while running sticks until the state changes.
  const hlsReady = statusQuery.data?.hls_ready ?? false
  const autoView: 'source' | 'annotated' =
    liveState === 'running' && hlsReady ? 'annotated' : 'source'
  useEffect(() => {
    setView(autoView)
  }, [autoView])

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
  const status: WorkerStatus | undefined = statusQuery.data
  const state = liveState
  const badgeState: StreamStatus = state === 'stopped' ? 'idle' : state
  const isActive = ACTIVE_STATES.has(state)
  const canToggleView = state === 'running'
  const counters: Counters | undefined = isActive ? status?.counters : countsQuery.data
  const latest = feed[0]
  const playerSrc =
    isActive && hlsReady && view === 'annotated' && playbackQuery.data
      ? playbackQuery.data.manifest_url
      : stream.source_url

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
            <StatusBadge status={badgeState} />
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
          {isActive ? (
            <Button
              variant="outline"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              <Square className="h-4 w-4" />
              Stop counting
            </Button>
          ) : (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              <Play className="h-4 w-4" />
              Start counting
            </Button>
          )}
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

      {state === 'error' && status?.last_error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <p className="text-body">{status.last_error}</p>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Video</CardTitle>
                <CardDescription>
                  {isActive && !hlsReady
                    ? 'Preparing the annotated output…'
                    : view === 'annotated'
                      ? 'The processed feed with boxes, lanes and counters.'
                      : 'The raw feed as received from the camera.'}
                </CardDescription>
              </div>
              {isActive && (
                <div className="flex items-center gap-1.5">
                  <ViewToggle
                    active={view === 'source'}
                    onClick={() => setView('source')}
                    disabled={!canToggleView}
                    title={!canToggleView ? 'Available while counting is running' : undefined}
                  >
                    Source
                  </ViewToggle>
                  <ViewToggle
                    active={view === 'annotated'}
                    onClick={() => setView('annotated')}
                    disabled={!canToggleView || !playbackQuery.data || !hlsReady}
                    title={
                      !canToggleView
                        ? 'Available while counting is running'
                        : !hlsReady
                          ? 'Preparing annotated output…'
                          : undefined
                    }
                  >
                    Annotated
                  </ViewToggle>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <HlsPlayer
                key={playerSrc}
                src={playerSrc}
                onResolution={view === 'source' ? setResolution : undefined}
              />
              <p className="mt-3 truncate text-xs text-muted">
                {view === 'annotated' ? 'Annotated HLS output' : stream.source_url}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Status</CardTitle>
                <CardDescription>
                  {isActive
                    ? 'Live worker telemetry.'
                    : 'Start counting to see worker telemetry.'}
                </CardDescription>
              </div>
              <LiveIndicator connected={connected} active={isActive} />
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <StatusRow label="State">
                <StatusBadge status={badgeState} />
              </StatusRow>
              <StatusRow label="Resolution">
                {status?.width
                  ? `${status.width} × ${status.height}`
                  : resolution
                    ? `${resolution.width} × ${resolution.height}`
                    : '—'}
              </StatusRow>
              <StatusRow label="Frame rate">
                {status && status.fps > 0 ? `${status.fps.toFixed(1)} fps` : '—'}
              </StatusRow>
              {fpsHistory.length > 1 && (
                <div className="rounded-lg border border-hairline bg-canvas-soft px-2 py-1.5">
                  <FpsSparkline samples={fpsHistory} />
                </div>
              )}
              <StatusRow label="Frames processed">
                {status && status.frames > 0 ? status.frames.toLocaleString() : '—'}
              </StatusRow>
              <StatusRow label="Processing">
                {status && status.latency_ms > 0 ? `${status.latency_ms.toFixed(0)} ms` : '—'}
              </StatusRow>
              <StatusRow label="Dropped">
                {status ? status.drop_count.toLocaleString() : '—'}
              </StatusRow>
              <StatusRow label="Uptime">
                {status && status.uptime_s > 0 ? formatDuration(status.uptime_s) : '—'}
              </StatusRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Counters</CardTitle>
              <CardDescription>
                {isActive ? 'Live entries by line.' : 'Totals from the latest session.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {!counters || counters.lines.length === 0 ? (
                <p className="text-sm text-muted">No counts yet.</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted">Total</span>
                    <AnimatedNumber
                      value={counters.total}
                      className="font-display text-3xl font-light text-ink"
                    />
                  </div>
                  <ul className="space-y-2 border-t border-hairline pt-3">
                    {counters.lines.map((line) => (
                      <li key={line.line_id} className="flex items-center gap-3 text-sm">
                        <span
                          key={latest?.line_id === line.line_id ? latest.ts : undefined}
                          className={cn(
                            'h-3 w-3 shrink-0 rounded-full',
                            latest?.line_id === line.line_id && 'animate-count-pop',
                          )}
                          style={{ backgroundColor: line.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-body">{line.name}</span>
                        <AnimatedNumber
                          value={line.total}
                          className="font-medium text-ink"
                        />
                      </li>
                    ))}
                  </ul>
                  {feed.length > 0 && (
                    <div className="border-t border-hairline pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        Latest
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {feed.slice(0, 5).map((entry) => (
                          <li
                            key={feedKey(entry)}
                            className="flex items-center gap-2 text-xs text-body"
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="truncate">
                              {entry.class_name}
                              {entry.name ? ` · ${entry.name}` : ''}
                            </span>
                            <span className="ml-auto shrink-0 text-muted">
                              {formatRelativeFromSeconds(entry.ts)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
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
          <Button variant="outline" onClick={() => setEditorOpen(true)}>
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
                Draw a line along a lane on the video, then start counting.
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
                  <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
                    Edit
                  </Button>
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

      <OverlayEditor
        streamId={streamId}
        lines={lines}
        roi={stream.roi}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

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

function LiveIndicator({ connected, active }: { connected: boolean; active: boolean }) {
  if (connected && active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        Live
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-success/60' : 'bg-muted')} />
      {connected ? 'Realtime' : 'Polling'}
    </span>
  )
}

function ViewToggle({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
        active ? 'bg-surface-strong text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
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