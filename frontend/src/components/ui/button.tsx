import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary hover:bg-primary-active',
        outline:
          'border border-hairline-strong bg-transparent text-ink hover:bg-surface-strong',
        ghost: 'bg-transparent text-ink hover:bg-surface-strong',
        subtle:
          'border border-hairline bg-surface text-ink shadow-soft hover:border-hairline-strong',
        link: 'h-auto rounded-none px-0 text-ink underline-offset-4 hover:underline',
        destructive: 'bg-error text-white hover:opacity-90',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-9 px-4 text-sm',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }