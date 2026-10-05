import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-md border border-hairline-strong bg-surface px-4 py-2 text-[15px] text-ink',
        'placeholder:text-muted-soft',
        'transition-[border-color,box-shadow] duration-200',
        'focus-visible:border-ink focus-visible:outline-none focus-visible:ring-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-error',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'