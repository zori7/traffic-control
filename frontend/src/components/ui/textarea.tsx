import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-24 w-full rounded-md border border-hairline-strong bg-surface px-4 py-3 text-[15px] text-ink',
      'placeholder:text-muted-soft',
      'transition-[border-color,box-shadow] duration-200',
      'focus-visible:border-ink focus-visible:outline-none focus-visible:ring-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-[invalid=true]:border-error',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
