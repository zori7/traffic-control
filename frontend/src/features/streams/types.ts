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
