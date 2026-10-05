import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0', className)} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-full w-full">
        <rect width="32" height="32" rx="8" fill="#0c0a09" />
        <path d="M5 16h22" stroke="#a7e5d3" strokeWidth="1.6" strokeDasharray="3 3" />
        <path
          d="M16 25.5V8m0 0-4.5 4.5M16 8l4.5 4.5"
          stroke="#f5f5f5"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="2.6" fill="#f4c5a8" />
      </svg>
    </span>
  )
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-2.5 rounded-full', className)}
      aria-label="Traffic Control home"
    >
      <LogoMark className="h-8 w-8" />
      <span className="font-display text-[21px] font-light tracking-[-0.02em] text-ink">
        Traffic Control
      </span>
    </Link>
  )
}