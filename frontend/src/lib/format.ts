const _RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const _relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** Human-friendly "3 hours ago" style timestamp. */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || Math.abs(diff) < 60_000) return 'just now'
  for (const [unit, ms] of _RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return _relative.format(-Math.round(diff / ms), unit)
  }
  return 'just now'
}

/** Host name for a source URL, falling back to the raw value. */
export function sourceHost(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.host || parsed.pathname
  } catch {
    return url
  }
}

/** Compact uptime, e.g. "1h 04m", "12m 30s" or "8s". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${seconds}s`
}

/** Relative time from a Unix timestamp in seconds (realtime feed). */
export function formatRelativeFromSeconds(seconds: number): string {
  return formatRelativeTime(new Date(seconds * 1000).toISOString())
}
