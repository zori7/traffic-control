import { apiFetch } from '@/lib/api'

import type {
  CountingLine,
  CountingSession,
  Counters,
  LineEvent,
  LineInput,
  Playback,
  Stream,
  StreamInput,
  WorkerStatus,
} from './types'

export function fetchStreams(): Promise<Stream[]> {
  return apiFetch<Stream[]>('/streams')
}

export function fetchStream(id: number): Promise<Stream> {
  return apiFetch<Stream>(`/streams/${id}`)
}

export function createStream(input: StreamInput): Promise<Stream> {
  return apiFetch<Stream>('/streams', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateStream(id: number, input: Partial<StreamInput>): Promise<Stream> {
  return apiFetch<Stream>(`/streams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteStream(id: number): Promise<void> {
  return apiFetch<void>(`/streams/${id}`, { method: 'DELETE' })
}

export function fetchLines(streamId: number): Promise<CountingLine[]> {
  return apiFetch<CountingLine[]>(`/streams/${streamId}/lines`)
}

export function createLine(streamId: number, input: LineInput): Promise<CountingLine> {
  return apiFetch<CountingLine>(`/streams/${streamId}/lines`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateLine(lineId: number, input: Partial<LineInput>): Promise<CountingLine> {
  return apiFetch<CountingLine>(`/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteLine(lineId: number): Promise<void> {
  return apiFetch<void>(`/lines/${lineId}`, { method: 'DELETE' })
}

export function updateRoi(streamId: number, roi: Stream['roi']): Promise<Stream> {
  return apiFetch<Stream>(`/streams/${streamId}/roi`, {
    method: 'PUT',
    body: JSON.stringify({ roi }),
  })
}

export function startStream(streamId: number): Promise<WorkerStatus> {
  return apiFetch<WorkerStatus>(`/streams/${streamId}/start`, { method: 'POST' })
}

export function stopStream(streamId: number): Promise<WorkerStatus> {
  return apiFetch<WorkerStatus>(`/streams/${streamId}/stop`, { method: 'POST' })
}

export function fetchStatus(streamId: number): Promise<WorkerStatus> {
  return apiFetch<WorkerStatus>(`/streams/${streamId}/status`)
}

export function fetchPlayback(streamId: number): Promise<Playback> {
  return apiFetch<Playback>(`/streams/${streamId}/playback`)
}

export function fetchCounts(streamId: number): Promise<Counters> {
  return apiFetch<Counters>(`/streams/${streamId}/counts`)
}

export function fetchSessions(streamId: number): Promise<CountingSession[]> {
  return apiFetch<CountingSession[]>(`/streams/${streamId}/sessions`)
}

export function fetchEvents(streamId: number, limit = 50): Promise<LineEvent[]> {
  return apiFetch<LineEvent[]>(`/streams/${streamId}/events?limit=${limit}`)
}

/** A single JPEG still of the source, used as the overlay editor background. */
export async function fetchFrameBlobUrl(streamId: number): Promise<string> {
  const response = await fetch(`/api/streams/${streamId}/frame?t=${Date.now()}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Could not capture a frame')
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}