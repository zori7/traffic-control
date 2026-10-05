import Hls from 'hls.js'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type PlayerState = 'connecting' | 'playing' | 'error'

export interface Resolution {
  width: number
  height: number
}

/**
 * Plays an HLS source directly from the camera. M3 will swap this for the
 * annotated output served by the backend.
 */
export function HlsPlayer({
  src,
  onResolution,
  className,
}: {
  src: string
  onResolution?: (resolution: Resolution | null) => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const resolutionRef = useRef(onResolution)
  const [state, setState] = useState<PlayerState>('connecting')
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    resolutionRef.current = onResolution
  }, [onResolution])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setState('connecting')
    setDetail(null)
    resolutionRef.current?.(null)

    const handlePlaying = () => setState('playing')
    const handleVideoError = () => {
      setState('error')
      setDetail('The browser could not play this stream.')
    }
    const handleMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        resolutionRef.current?.({ width: video.videoWidth, height: video.videoHeight })
      }
    }

    video.addEventListener('playing', handlePlaying)
    video.addEventListener('error', handleVideoError)
    video.addEventListener('loadedmetadata', handleMetadata)

    let hls: Hls | null = null
    let networkRetries = 0
    let mediaRetries = 0
    let retryTimer: number | null = null
    const MAX_NETWORK_RETRIES = 8

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetries = 0
        void video.play().catch(() => undefined)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        // The annotated playlist can briefly 404 (or be half-written) while the
        // worker emits its first segment, or during a network blip. Retry with
        // backoff instead of surfacing a fatal error and getting stuck.
        const retryableManifest =
          data.type === Hls.ErrorTypes.NETWORK_ERROR ||
          data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
        if (retryableManifest && networkRetries < MAX_NETWORK_RETRIES) {
          networkRetries += 1
          setState('connecting')
          const delay = Math.min(500 * networkRetries, 3000)
          if (retryTimer !== null) window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            hls?.startLoad()
          }, delay)
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
          mediaRetries += 1
          hls?.recoverMediaError()
          return
        }
        setState('error')
        setDetail(data.details || 'The stream could not be loaded.')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      void video.play().catch(() => undefined)
    } else {
      setState('error')
      setDetail('HLS playback is not supported in this browser.')
    }

    return () => {
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('error', handleVideoError)
      video.removeEventListener('loadedmetadata', handleMetadata)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      hls?.destroy()
    }
  }, [src])

  return (
    <div
      className={cn(
        'relative aspect-video overflow-hidden rounded-xl bg-[#0c0a09]',
        className,
      )}
    >
      <video ref={videoRef} className="h-full w-full object-contain" controls muted playsInline />

      {state !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0c0a09]/85 px-6 text-center">
          {state === 'connecting' ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
              <TriangleAlert className="h-5 w-5 text-white/80" />
            </span>
          )}
          <p className="text-sm text-white/85">
            {state === 'connecting' ? 'Connecting to source…' : 'Stream unavailable'}
          </p>
          {state === 'error' && detail && (
            <p className="max-w-sm text-xs text-white/50">{detail}</p>
          )}
        </div>
      )}
    </div>
  )
}
