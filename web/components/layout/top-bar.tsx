'use client'

import { memo } from 'react'
import { ThemeToggle } from './theme-toggle'
import { QuickLogTriggerPill } from '@/components/log-form/quick-log-trigger'

interface TopBarProps {
  pageTitle: string
  greeting: string
  userName: string
}

/**
 * Sticky, backdrop-blurred header. Page title + greeting on the left, the
 * floating quick-log command bar trigger and theme toggle on the right.
 */
export const TopBar = memo(function TopBar({ pageTitle, greeting, userName }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-5 md:px-8 h-16">
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-xl font-semibold text-foreground tracking-tight truncate">
            {pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {greeting}，{userName}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <QuickLogTriggerPill />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
})
