import { Badge, type BadgeProps } from '@/components/ui/badge'

import type { StreamStatus } from './types'

const LABELS: Record<StreamStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  error: 'Error',
}

const VARIANTS: Record<StreamStatus, BadgeProps['variant']> = {
  idle: 'outline',
  starting: 'default',
  running: 'success',
  stopping: 'default',
  error: 'error',
}

export function StatusBadge({ status }: { status: StreamStatus }) {
  const busy = status === 'starting' || status === 'stopping'
  return (
    <Badge variant={VARIANTS[status]} className={busy ? 'animate-pulse' : undefined}>
      {status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
      {LABELS[status]}
    </Badge>
  )
}
