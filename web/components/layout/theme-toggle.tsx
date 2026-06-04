'use client'

import { memo, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

/**
 * Hydration-safe sun/moon toggle. Renders a placeholder of identical size
 * until mounted so the initial paint matches what next-themes resolves to —
 * preventing the icon from "popping" on first paint.
 */
export const ThemeToggle = memo(function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? '切换到浅色' : '切换到深色'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary',
        className
      )}
    >
      {/* Reserve box even before mount to avoid layout shift / flash. */}
      <span className="sr-only">切换主题</span>
      {mounted ? (
        isDark ? (
          <Sun size={16} />
        ) : (
          <Moon size={16} />
        )
      ) : (
        <span className="block h-4 w-4" aria-hidden />
      )}
    </button>
  )
})
