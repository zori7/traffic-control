import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTheme } from '@/components/theme/theme-provider'

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'system'}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group flex items-start gap-3 rounded-xl border border-hairline bg-surface text-ink shadow-lift',
          description: 'text-muted',
          actionButton: 'bg-primary text-on-primary rounded-full',
          cancelButton: 'bg-surface-strong text-muted rounded-full',
          success: 'text-ink',
          error: 'text-ink',
        },
      }}
      {...props}
    />
  )
}