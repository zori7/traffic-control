export interface Point {
  x: number
  y: number
}

export type StreamStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error'

export interface Roi {
  x: number
  y: number
  width: number
  height: number
}

export interface Stream {
  id: number
  owner_id: number
  name: string
  description: string | null
  source_url: string
  source_kind: string
  status: StreamStatus
  roi: Roi | null
  config: Record<string, unknown>
  last_error: string | null
  line_count: number
  created_at: string
  updated_at: string
}

export interface CountingLine {
  id: number
  stream_id: number
  name: string
  points: Point[]
  classes: string[]
  color: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface StreamInput {
  name: string
  description: string | null
  source_url: string
}

export interface LineInput {
  name: string
  points: Point[]
  classes: string[]
  color: string
}

export interface LineCount {
  line_id: number
  name: string
  color: string
  total: number
  classes: Record<string, number>
}

export interface Counters {
  lines: LineCount[]
  total: number
}

export type WorkerState = StreamStatus | 'stopped'

export interface WorkerStatus {
  stream_id: number
  session_id: number | null
  state: WorkerState
  width: number
  height: number
  fps: number
  frames: number
  drop_count: number
  latency_ms: number
  started_at: number | null
  uptime_s: number
  last_error: string | null
  hls_ready: boolean
  counters: Counters
}

export interface Playback {
  manifest_url: string
  snapshot_url: string
}

export interface CountingSession {
  id: number
  stream_id: number
  started_at: string
  ended_at: string | null
  frames: number
  avg_fps: number | null
  duration_ms: number | null
  drop_count: number
  width: number | null
  height: number | null
  last_error: string | null
}

export interface LineEvent {
  id: number
  session_id: number
  line_id: number
  track_id: number
  class_name: string
  confidence: number | null
  bbox: Record<string, number> | null
  ts: string
}

export const VEHICLE_CLASSES = [
  { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' },
  { value: 'bus', label: 'Bus' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'person', label: 'Person' },
] as const

export const LINE_COLORS = [
  '#a7e5d3',
  '#f4c5a8',
  '#c8b8e0',
  '#a8c8e8',
  '#e8b8c4',
] as const
