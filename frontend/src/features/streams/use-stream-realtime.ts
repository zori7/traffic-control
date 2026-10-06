import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getRealtimeSocket } from '@/lib/realtime'

import type { LiveEntry, WorkerStatus } from './types'

const MAX_FPS_SAMPLES = 48
const MAX_FEED = 12
const ACTIVE_STATES = new Set(['starting', 'running', 'stopping'])

export interface StreamRealtime {
  /** True while the Socket.IO connection is up and the stream is subscribed. */
  connected: boolean
  /** Recent processed frame rates, oldest first. */
  fpsHistory: number[]
  /** Most recent line crossings, newest first. */
  feed: LiveEntry[]
}

/**
 * Stable identity of a crossing. A vehicle can cross several lines in the same
 * frame, so `track_id` + `ts` alone is not unique — the line is part of it.
 */
export function feedKey(entry: LiveEntry): string {
  return `${entry.line_id}-${entry.track_id}-${entry.ts}`
}

/**
 * Subscribe to a stream's realtime channel. Status snapshots (including
 * counters) are written straight into the React Query cache, so the page reads
 * live data without polling while connected.
 */
export function useStreamRealtime(streamId: number, enabled = true): StreamRealtime {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [fpsHistory, setFpsHistory] = useState<number[]>([])
  const [feed, setFeed] = useState<LiveEntry[]>([])
  const [trackedStream, setTrackedStream] = useState(streamId)

  // Switching streams resets the rolling history (adjust during render).
  if (trackedStream !== streamId) {
    setTrackedStream(streamId)
    setFpsHistory([])
    setFeed([])
  }

  useEffect(() => {
    if (!enabled || !Number.isInteger(streamId) || streamId <= 0) return

    const socket = getRealtimeSocket()

    const onConnect = () => {
      setConnected(true)
      socket.emit('subscribe', { stream_id: streamId })
    }
    const onDisconnect = () => setConnected(false)
    const onStatus = (payload: WorkerStatus) => {
      if (payload.stream_id !== streamId) return
      queryClient.setQueryData(['streams', streamId, 'status'], payload)
      setFpsHistory((history) => [...history, payload.fps].slice(-MAX_FPS_SAMPLES))
      if (!ACTIVE_STATES.has(payload.state)) {
        queryClient.invalidateQueries({ queryKey: ['streams', streamId, 'counts'] })
      }
    }
    const onCount = (entry: LiveEntry) => {
      if (entry.stream_id !== streamId) return
      // Re-subscribing (StrictMode, socket reconnect) can replay recent
      // crossings, so drop anything already in the feed before prepending.
      const key = feedKey(entry)
      setFeed((items) =>
        [entry, ...items.filter((item) => feedKey(item) !== key)].slice(0, MAX_FEED),
      )
    }
    const onSubscribeError = (payload: { message?: string }) => {
      console.warn('Realtime subscription rejected:', payload?.message ?? 'unknown error')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('status', onStatus)
    socket.on('count', onCount)
    socket.on('subscribe_error', onSubscribeError)
    if (socket.connected) onConnect()

    return () => {
      socket.emit('unsubscribe', { stream_id: streamId })
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('status', onStatus)
      socket.off('count', onCount)
      socket.off('subscribe_error', onSubscribeError)
    }
  }, [enabled, streamId, queryClient])

  return { connected, fpsHistory, feed }
}
