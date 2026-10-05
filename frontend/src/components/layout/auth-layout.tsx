import type { ReactNode } from 'react'

import { Logo } from './logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-hairline bg-canvas-soft lg:block">
        <div className="orb -left-16 top-10 h-72 w-72 bg-gradient-mint animate-orb-drift" />
        <div className="orb right-0 top-1/3 h-80 w-80 bg-gradient-lavender animate-orb-drift-alt" />
        <div className="orb bottom-0 left-1/4 h-72 w-72 bg-gradient-peach animate-orb-drift" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div className="max-w-md">
            <h2 className="display text-4xl text-balance">
              Every vehicle, counted as it crosses your line.
            </h2>
            <p className="mt-4 text-body">
              Draw a direction on any stream and Traffic Control keeps the tally — per line, per
              class, in real time.
            </p>
          </div>
          <p className="text-sm text-muted">Real-time vision for road networks.</p>
        </div>
      </aside>

      <div className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-sans text-2xl font-medium text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}