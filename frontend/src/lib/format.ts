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
