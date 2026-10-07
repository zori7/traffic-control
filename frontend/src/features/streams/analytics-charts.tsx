import type { ReactNode } from 'react'

import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * A responsive column chart of crossings per minute bucket. Rendered with
 * divs rather than SVG so it scales cleanly at any width.
 */
export function TrendChart({
  points,
  className,
}: {
  points: { bucket_start: string; total: number }[]
  className?: string
}) {
  const peak = Math.max(...points.map((point) => point.total), 1)
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-44 items-end gap-1">
        {points.map((point) => {
          const ratio = point.total / peak
          return (
            <div
              key={point.bucket_start}
              className="flex h-full flex-1 items-end"
              title={`${formatClock(point.bucket_start)} · ${point.total.toLocaleString()} ${
                point.total === 1 ? 'crossing' : 'crossings'
              }`}
            >
              {point.total > 0 ? (
                <div
                  className="w-full rounded-t-[3px]"
                  style={{
                    height: `${Math.max(ratio * 100, 2)}%`,
                    background: 'linear-gradient(to top, var(--chart-from), var(--chart-to))',
                  }}
                />
              ) : (
                <div className="h-[3px] w-full rounded-t-[3px] bg-hairline" />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-4 text-xs text-muted">
        <span>{first ? formatClock(first.bucket_start) : ''}</span>
        <span>peak {peak.toLocaleString()}</span>
        <span>{last ? formatClock(last.bucket_start) : ''}</span>
      </div>
    </div>
  )
}

export interface BreakdownItem {
  key: string
  label: string
  value: number
  color?: string
  detail?: ReactNode
}

/** A labelled bar list — used for both the per-line and per-class breakdowns. */
export function BreakdownBars({
  items,
  className,
}: {
  items: BreakdownItem[]
  className?: string
}) {
  const peak = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className={cn('space-y-4', className)}>
      {items.map((item) => (
        <li key={item.key} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? 'var(--chart-to)' }}
              />
              <span className="truncate text-body">{item.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink">
              {item.value.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas-soft">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / peak) * 100, item.value > 0 ? 2 : 0)}%`,
                background:
                  item.color ?? 'linear-gradient(to right, var(--chart-from), var(--chart-to))',
              }}
            />
          </div>
          {item.detail}
        </li>
      ))}
    </ul>
  )
}