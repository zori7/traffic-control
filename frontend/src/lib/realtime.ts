import { io, type Socket } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * Where to reach the realtime server. Same origin by default (the dev server
 * proxies `/socket.io`); when the API is configured as an absolute URL we
 * connect straight to that origin.
 */
function resolveSocketUrl(): string | undefined {
  if (/^https?:\/\//.test(API_BASE)) return new URL(API_BASE).origin
  return undefined
}

let socket: Socket | null = null

/** The shared Socket.IO connection. Auth rides on the HttpOnly cookie. */
export function getRealtimeSocket(): Socket {
  socket ??= io(resolveSocketUrl(), {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })
  return socket
}

/** Tear the connection down (e.g. on logout) so a new session re-auths. */
export function disconnectRealtime(): void {
  socket?.disconnect()
  socket = null
}
