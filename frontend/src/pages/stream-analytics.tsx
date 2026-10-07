import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, Download, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchAnalytics, fetchExport, fetchSessions, fetchStream } from '@/features/streams/api'
import { BreakdownBars, TrendChart } from '@/features/streams/analytics-charts'
import { classColor } from '@/features/streams/analytics-colors'
import { VEHICLE_CLASSES, type ExportDataset, type ExportFormat } from '@/features/streams/types'
import { ApiError } from '@/lib/api'
import { saveBlob } from '@/lib/download'
import { formatDateTime, formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

const CLASS_LABELS: Record<string, string> = Object.fromEntries(
  VEHICLE_CLASSES.map((vehicle) => [vehicle.value, vehicle.label]),
)

function classLabel(name: string): string {
  return CLASS_LABELS[name] ?? name
}

export function StreamAnalyticsPage() {
  const params = useParams()
  const streamId = Number(params.id)
  const validId = Number.isInteger(streamId) && streamId > 0

  const [sessionId, setSessionId] = useState<number | undefined>(undefined)
  const [exporting, setExporting] = useState<string | null>(null)

  const streamQuery = useQuery({
    queryKey: ['streams', streamId],
    queryFn: () => fetchStream(streamId),
    enabled: validId,
  })
  const sessionsQuery = useQuery({
    queryKey: ['streams', streamId, 'sessions'],
    queryFn: () => fetchSessions(streamId),
    enabled: validId,
  })
  const analyticsQuery = useQuery({
    queryKey: ['streams', streamId, 'analytics', sessionId ?? 'latest'],
    queryFn: () => fetchAnalytics(streamId, sessionId),
    enabled: validId,
    refetchInterval: () => (streamQuery.data?.status === 'running' ? 15000 : false),
  })

  const sessions = sessionsQuery.data ?? []
  const analytics = analyticsQuery.data
  const resolvedSessionId = analytics?.session_id ?? null

  async function handleExport(dataset: ExportDataset, format: ExportFormat) {
    const key = `${dataset}-${format}`
    setExporting(key)
    try {
      const { blob, filename } = await fetchExport(
        streamId,
        dataset,
        format,
        resolvedSessionId ?? undefined,
      )
      saveBlob(blob, filename ?? `${dataset}.${format}`)
      toast.success(`${dataset === 'counts' ? 'Counts' : 'Events'} exported as ${format.toUpperCase()}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not export the data')
    } finally {
      setExporting(null)
    }
  }

  if (streamQuery.isLoading) return <AnalyticsSkeleton />

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
        <Button variant="outline" className="mt-6" asChild>
          <Link to="/streams">Back to streams</Link>
        </Button>
      </div>
    )
  }

  const series = analytics?.series ?? []
  const peak = series.reduce((max, point) => Math.max(max, point.total), 0)
  const durationSeconds =
    analytics?.started_at && analytics.ended_at
      ? (new Date(analytics.ended_at).getTime() - new Date(analytics.started_at).getTime()) / 1000
      : null
  const hasData = Boolean(analytics?.session_id) && (analytics?.total ?? 0) > 0

  return (
    <div className="container py-10">
      <Link
        to={`/streams/${streamId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {stream.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-muted">
              <BarChart3 className="h-4 w-4" />
            </span>
            <h1 className="display text-4xl">Analytics</h1>
          </div>
          <p className="mt-2 max-w-2xl text-body">
            Entry counts by line and class, aggregated from the counting sessions of{' '}
            <span className="text-ink">{stream.name}</span>.
          </p>
        </div>
        {sessions.length > 0 && (
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Session
            <select
              value={sessionId ?? ''}
              onChange={(event) =>
                setSessionId(event.target.value ? Number(event.target.value) : undefined)
              }
              className="h-10 rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Latest session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDateTime(session.started_at)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {sessionsQuery.isLoading ? (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : sessions.length === 0 || !analytics?.session_id ? (
        <div className="mt-10 rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-6 py-16 text-center">
          <p className="font-sans text-sm font-medium text-ink">No counting sessions yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Start counting on this stream and the session analytics will appear here.
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <Link to={`/streams/${streamId}`}>Back to stream</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total crossings" value={analytics.total.toLocaleString()} />
            <Stat label="Peak per minute" value={peak.toLocaleString()} />
            <Stat label="Duration" value={durationSeconds === null ? 'Running' : formatDuration(durationSeconds)} />
            <Stat label="Active lines" value={String(analytics.by_line.length)} />
          </div>

          <p className="mt-3 text-xs text-muted">
            Session #{analytics.session_id} · {formatDateTime(analytics.started_at ?? '')}
            {analytics.ended_at ? ` – ${formatDateTime(analytics.ended_at)}` : ' · running'}
          </p>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Crossings over time</CardTitle>
              <CardDescription>Entries per minute across all lines of the session.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {series.length === 0 || !hasData ? (
                <p className="py-10 text-center text-sm text-muted">
                  No crossings were recorded in this session.
                </p>
              ) : (
                <TrendChart points={series} />
              )}
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By line</CardTitle>
                <CardDescription>Entries per counting line, split by vehicle class.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.by_line.length === 0 ? (
                  <p className="text-sm text-muted">No counts yet.</p>
                ) : (
                  <BreakdownBars
                    items={analytics.by_line.map((line) => ({
                      key: String(line.line_id),
                      label: line.name,
                      value: line.total,
                      color: line.color,
                      detail: <ClassBreakdown classes={line.classes} />,
                    }))}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By class</CardTitle>
                <CardDescription>Which vehicle types crossed the lines.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.by_class.length === 0 ? (
                  <p className="text-sm text-muted">No counts yet.</p>
                ) : (
                  <BreakdownBars
                    items={analytics.by_class.map((entry, index) => ({
                      key: entry.class_name,
                      label: classLabel(entry.class_name),
                      value: entry.count,
                      color: classColor(index),
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>
                Download this session&apos;s data as a spreadsheet-friendly CSV or JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <ExportRow
                label="Counts"
                description="Per-minute totals by line and class."
                onExport={handleExport}
                exporting={exporting}
                disabled={resolvedSessionId === null}
              />
              <ExportRow
                label="Events"
                description="Every individual line crossing, newest first."
                onExport={handleExport}
                exporting={exporting}
                disabled={resolvedSessionId === null}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function ClassBreakdown({ classes }: { classes: Record<string, number> }) {
  const entries = Object.entries(classes).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  return (
    <p className="pl-4 text-xs text-muted">
      {entries.map(([name, count]) => `${classLabel(name)} ${count}`).join(' · ')}
    </p>
  )
}

function ExportRow({
  label,
  description,
  onExport,
  exporting,
  disabled,
}: {
  label: string
  description: string
  onExport: (dataset: ExportDataset, format: ExportFormat) => void
  exporting: string | null
  disabled: boolean
}) {
  const dataset = label.toLowerCase() as ExportDataset
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-sans text-[15px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {(['csv', 'json'] as const).map((format) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={disabled || exporting !== null}
            onClick={() => onExport(dataset, format)}
          >
            <Download className={cn('h-3.5 w-3.5', exporting === `${dataset}-${format}` && 'animate-pulse')} />
            {format.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-light tabular-nums text-ink">{value}</p>
    </Card>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="container py-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-5 h-10 w-56" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 w-full rounded-xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-60 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    </div>
  )
}