import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import { AnimatedNumber } from '@/components/animated-number'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Kind = 'car' | 'truck' | 'bus' | 'motorcycle'

/** A lane line is a segment drawn *along* a lane, pointing in the travel direction. */
interface LaneLine {
  id: number
  lane: number
  startX: number
  endX: number
}

interface Vehicle {
  id: number
  lane: number
  kind: Kind
  duration: number
  delay: number
}

const LANES = 3

const LANE_LINES: LaneLine[] = [
  { id: 1, lane: 0, startX: 26, endX: 80 },
  { id: 2, lane: 2, startX: 26, endX: 80 },
]

const VEHICLES: Vehicle[] = [
  { id: 1, lane: 0, kind: 'car', duration: 6.2, delay: 0 },
  { id: 2, lane: 0, kind: 'truck', duration: 8.4, delay: 2.6 },
  { id: 3, lane: 1, kind: 'bus', duration: 7.6, delay: 0.8 },
  { id: 4, lane: 1, kind: 'car', duration: 6.0, delay: 3.9 },
  { id: 5, lane: 2, kind: 'motorcycle', duration: 5.4, delay: 1.5 },
  { id: 6, lane: 2, kind: 'car', duration: 6.8, delay: 4.7 },
  { id: 7, lane: 2, kind: 'truck', duration: 8.0, delay: 0.3 },
]

const KIND_DIMS: Record<Kind, { width: string; height: string }> = {
  car: { width: '3.6rem', height: '1.6rem' },
  truck: { width: '5rem', height: '1.9rem' },
  bus: { width: '4.4rem', height: '1.9rem' },
  motorcycle: { width: '1.8rem', height: '1.3rem' },
}

const laneCenter = (lane: number) => `${(lane + 0.5) * (100 / LANES)}%`

// Vehicles animate from -16% to 116%; the entry end sits at startX = 26%.
const ENTRY_FRACTION = (26 + 16) / (116 + 16)

interface Counts {
  total: number
  byLine: Record<number, number>
  byKind: Record<Kind, number>
}

const EMPTY_COUNTS: Counts = {
  total: 0,
  byLine: { 1: 0, 2: 0 },
  byKind: { car: 0, truck: 0, bus: 0, motorcycle: 0 },
}

export function TrafficVisualization() {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)

  useEffect(() => {
    const timeouts: number[] = []
    const intervals: number[] = []

    const lineForLane = (lane: number) => LANE_LINES.find((line) => line.lane === lane)

    const bump = (vehicle: Vehicle, lineId: number) => {
      setCounts((current) => ({
        total: current.total + 1,
        byLine: { ...current.byLine, [lineId]: current.byLine[lineId] + 1 },
        byKind: { ...current.byKind, [vehicle.kind]: current.byKind[vehicle.kind] + 1 },
      }))
    }

    for (const vehicle of VEHICLES) {
      const line = lineForLane(vehicle.lane)
      // Lanes without a line are not counted.
      if (!line) continue

      const firstEntry = (vehicle.delay + vehicle.duration * ENTRY_FRACTION) * 1000
      timeouts.push(
        window.setTimeout(() => {
          bump(vehicle, line.id)
          intervals.push(
            window.setInterval(() => bump(vehicle, line.id), vehicle.duration * 1000),
          )
        }, firstEntry),
      )
    }

    return () => {
      timeouts.forEach(window.clearTimeout)
      intervals.forEach(window.clearInterval)
    }
  }, [])

  const classes = useMemo(
    () => [
      { label: 'Cars', value: counts.byKind.car },
      { label: 'Trucks', value: counts.byKind.truck },
      { label: 'Buses', value: counts.byKind.bus },
      { label: 'Motorcycles', value: counts.byKind.motorcycle },
    ],
    [counts.byKind],
  )

  return (
    <div
      data-testid="traffic-visualization"
      className="relative overflow-hidden rounded-2xl border border-hairline bg-surface p-4 shadow-lift sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Badge variant="success" className="gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Live
          </Badge>
          <span className="text-sm text-muted">Live preview</span>
        </div>
        <span className="rounded-full border border-hairline px-2.5 py-1 text-xs text-muted">
          25 fps
        </span>
      </div>

      {/* Top-down road — a fixed dark media surface in both themes. */}
      <div className="relative mt-4 h-[248px] overflow-hidden rounded-xl bg-[#121110]">
        <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/10" />
        <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/10" />

        {LANE_LINES.map((line) => (
          <div key={line.id}>
            {/* Label with the live per-line count */}
            <span
              className="absolute z-10 -translate-y-[175%] whitespace-nowrap rounded-full bg-gradient-mint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#0c0a09]"
              style={{ left: `${line.startX}%`, top: laneCenter(line.lane) }}
            >
              Line {line.id} · {counts.byLine[line.id]}
            </span>

            {/* The lane line itself, running along the lane */}
            <div
              className="absolute h-0 border-t-2 border-dashed border-gradient-mint"
              style={{
                left: `${line.startX}%`,
                width: `${line.endX - line.startX}%`,
                top: laneCenter(line.lane),
              }}
            />

            {/* Entry end — where a vehicle counts */}
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gradient-mint bg-[#121110]"
              style={{ left: `${line.startX}%`, top: laneCenter(line.lane) }}
            />

            {/* Direction arrow at the far end */}
            <svg
              viewBox="0 0 8 8"
              aria-hidden="true"
              className="absolute h-3 w-3 -translate-y-1/2"
              style={{ left: `${line.endX}%`, top: laneCenter(line.lane) }}
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="#a7e5d3" />
            </svg>

            {/* Entry flash, replayed each time the line counts a vehicle */}
            <motion.span
              key={counts.byLine[line.id]}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1, 1.7] }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-mint blur-md"
              style={{ left: `${line.startX}%`, top: laneCenter(line.lane) }}
            />
          </div>
        ))}

        {VEHICLES.map((vehicle) => {
          const dims = KIND_DIMS[vehicle.kind]
          return (
            <div
              key={vehicle.id}
              className="absolute"
              style={{
                top: laneCenter(vehicle.lane),
                transform: 'translateY(-50%)',
                animation: `tc-drive-right ${vehicle.duration}s linear ${vehicle.delay}s infinite`,
              }}
            >
              <div
                className={cn(
                  'relative rounded-md border border-white/15 bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.45)]',
                  vehicle.kind === 'motorcycle' && 'bg-gradient-mint',
                )}
                style={{ width: dims.width, height: dims.height }}
              >
                <span className="absolute inset-x-1.5 top-1 h-1/3 rounded-sm bg-black/15" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Total" value={counts.total} emphasis />
        <Stat label="Line 1" value={counts.byLine[1]} />
        <Stat label="Line 2" value={counts.byLine[2]} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {classes.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {item.label}
            </p>
            <p className="mt-0.5 font-sans text-lg font-medium text-ink">
              <AnimatedNumber value={item.value} />
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: number
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        emphasis ? 'border-hairline-strong bg-ink text-canvas' : 'border-hairline bg-canvas-soft',
      )}
    >
      <p
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.06em]',
          emphasis ? 'text-canvas' : 'text-muted',
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-sans text-2xl font-medium leading-none">
        <AnimatedNumber value={value} />
      </p>
    </div>
  )
}