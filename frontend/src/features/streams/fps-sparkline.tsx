import { cn } from '@/lib/utils'

/**
 * A compact line chart of recent frame rates. Renders nothing until there are
 * at least two samples to connect.
 */
export function FpsSparkline({ samples, className }: { samples: number[]; className?: string }) {
  if (samples.length < 2) return null

  const width = 100
  const height = 28
  const peak = Math.max(...samples, 1)
  const step = width / (samples.length - 1)
  const points = samples.map((value, index) => {
    const x = index * step
    const y = height - (value / peak) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const area = `0,${height} ${points.join(' ')} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('h-8 w-full', className)}
    >
      <polygon points={area} className="fill-primary/10" />
      <polyline
        points={points.join(' ')}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="stroke-primary"
      />
    </svg>
  )
}
