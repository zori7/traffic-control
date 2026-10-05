import { apiFetch } from '@/lib/api'

import type { CountingLine, Stream, StreamInput } from './types'

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

export function deleteLine(lineId: number): Promise<void> {
  return apiFetch<void>(`/lines/${lineId}`, { method: 'DELETE' })
}
