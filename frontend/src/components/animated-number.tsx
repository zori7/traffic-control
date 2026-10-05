import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/lib/utils'

/**
 * Animated counter. Each digit rolls independently as the value changes —
 * the feedback surface for live counts.
 */
export function AnimatedNumber({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const formatted = Math.round(value).toLocaleString('en-US')
  const digits = formatted.split('')

  return (
    <span
      role="img"
      aria-label={formatted}
      className={cn('inline-flex items-stretch tabular-nums leading-none', className)}
    >
      {digits.map((digit, index) =>
        digit === ',' ? (
          <span key={`sep-${index}`} className="inline-flex h-[1.05em] items-center">
            ,
          </span>
        ) : (
          <span
            key={`${index}-${digits.length}`}
            className="relative inline-flex h-[1.05em] w-[1ch] items-center justify-center overflow-hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={digit}
                initial={{ y: '0.9em', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-0.9em', opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="absolute"
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </span>
        ),
      )}
    </span>
  )
}