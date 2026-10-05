import { Loader2 } from 'lucide-react'

import { LogoMark } from './logo'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <div className="flex items-center gap-2.5">
        <LogoMark className="h-8 w-8 animate-pulse" />
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      </div>
    </div>
  )
}