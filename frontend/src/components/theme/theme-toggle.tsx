import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme/theme-provider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn('relative', className)}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <Sun
        className={cn(
          'h-[18px] w-[18px] transition-all duration-300',
          isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute h-[18px] w-[18px] transition-all duration-300',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0',
        )}
      />
    </Button>
  )
}