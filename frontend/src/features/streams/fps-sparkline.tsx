import { useId } from 'react'

import { cn } from '@/lib/utils'

/**
 * A compact line chart of recent frame rates. Renders nothing until there are
 * at least two samples to connect. The stroke follows the brand's pastel
 * gradient via the theme-aware `--chart-from` / `--chart-to` tokens.
 */
export function FpsSparkline({ samples, className }: { samples: number[]; className?: string }) {
  const uid = useId().replace(/:/g, '')
  if (samples.length < 2) return null

  const width = 100
  const height = 28
  const inset = 2.5
  const usable = height - inset * 2
  const peak = Math.max(...samples, 1)
  const step = width / (samples.length - 1)

  const points = samples.map((value, index) => {
    const x = index * step
    const y = inset + (1 - value / peak) * usable
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const area = `0,${height} ${points.join(' ')} ${width},${height}`
  const lineId = `${uid}-line`
  const fillId = `${uid}-fill`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('h-8 w-full', className)}
    >
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--chart-from)" />
          <stop offset="100%" stopColor="var(--chart-to)" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-to)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--chart-to)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${fillId})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
