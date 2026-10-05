import { useEffect, useState } from 'react'

export function TypedText({
  phrases,
  className,
  typeSpeed = 68,
  deleteSpeed = 34,
  pause = 1600,
}: {
  phrases: string[]
  className?: string
  typeSpeed?: number
  deleteSpeed?: number
  pause?: number
}) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [subIndex, setSubIndex] = useState(0)
  const [deleting, setDeleting] = useState(false)

  const current = phrases[phraseIndex % phrases.length]

  useEffect(() => {
    if (!deleting && subIndex === current.length) {
      const timeout = setTimeout(() => setDeleting(true), pause)
      return () => clearTimeout(timeout)
    }

    if (deleting && subIndex === 0) {
      setDeleting(false)
      setPhraseIndex((index) => (index + 1) % phrases.length)
      return
    }

    const timeout = setTimeout(
      () => setSubIndex((index) => index + (deleting ? -1 : 1)),
      deleting ? deleteSpeed : typeSpeed,
    )
    return () => clearTimeout(timeout)
  }, [subIndex, deleting, current, phrases.length, typeSpeed, deleteSpeed, pause])

  return (
    <span className={className}>
      <span className="sr-only">{phrases.join(', ')}</span>
      <span aria-hidden="true">{current.substring(0, subIndex)}</span>
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em] animate-caret-blink bg-ink align-middle"
      />
    </span>
  )
}