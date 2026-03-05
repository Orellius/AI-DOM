import { useState, useEffect } from 'react'
import { scaled } from '../utils/scale'

const THINKING_MESSAGES = [
  'Contemplating the void...',
  'Parsing your intentions...',
  'Consulting the oracle...',
  'Warming up neurons...',
  'Brewing a response...',
  'Summoning intellect...',
  'Crunching thoughts...',
  'Asking the rubber duck...',
  'Aligning tokens...',
  'Untangling logic...',
  'Channeling the machine spirit...',
  'Defragmenting brain...',
  'Loading wisdom.dll...',
  'Compiling thoughts...',
  'Traversing the knowledge graph...',
  'Feeding the hamster wheel...',
  'Polishing the crystal ball...',
  'Spinning up cognition...',
  'Consulting stack overflow...',
  'Wrangling electrons...',
]

// Shuffle on mount so it's not always the same order
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface ThinkingIndicatorProps {
  /** 'inline' for inside message bubble, 'bar' for command bar area */
  variant?: 'inline' | 'bar'
}

export function ThinkingIndicator({ variant = 'inline' }: ThinkingIndicatorProps): JSX.Element {
  const [messages] = useState(() => shuffled(THINKING_MESSAGES))
  const [index, setIndex] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndex((i) => (i + 1) % messages.length)
        setFade(true)
      }, 200)
    }, 3000)

    return () => clearInterval(interval)
  }, [messages.length])

  if (variant === 'bar') {
    return (
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(11),
          color: 'var(--color-accent-dim)',
          opacity: fade ? 0.8 : 0,
          transition: 'opacity 0.2s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {messages[index]}
      </span>
    )
  }

  return (
    <span
      style={{
        color: 'var(--color-text-dim)',
        opacity: fade ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      {messages[index]}
    </span>
  )
}
