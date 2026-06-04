'use client'

import type { ReactNode } from 'react'
import { SidebarNav } from './sidebar-nav'
import { TopBar } from './top-bar'
import { MobileTabBar } from './mobile-tab-bar'
import { QuickLogProvider } from '@/components/log-form/quick-log-provider'

interface AppShellProps {
  activeNav: string
  onNavChange: (id: string) => void
  pageTitle: string
  greeting: string
  userName: string
  /** Renders to the right of the sidebar, below the top-bar. */
  children: ReactNode
  /** Optional floating overlay slot (used for the AI chat widget). */
  overlay?: ReactNode
  /** Auth'd user id, passed down to the floating quick-log command bar. */
  userId?: string
  /** Fired after a successful quick-log submission so the page can refetch. */
  onQuickLogged?: () => void
}

/**
 * Outer chrome for the dashboard. Composes the desktop sidebar rail, the
 * top-bar, the mobile floating tab bar, and the scrollable content region.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [SidebarRail] │  TopBar (sticky)               │
 *   │               ├────────────────────────────────┤
 *   │   md+ only    │  Scroll region (children)      │
 *   │               │                                │
 *   │               │             …                  │
 *   │               │  ┌────────────────────────┐    │  ← MobileTabBar floats
 *   │               │  │  [tab][tab][tab][tab]  │    │     bottom-center on mobile
 *   │               │  └────────────────────────┘    │
 *   └────────────────────────────────────────────────┘
 *
 * The previous version inlined all of this into `app/page.tsx`. Pulling it
 * into a dedicated component lets future pages (settings, knowledge base)
 * reuse the same shell without copy-paste.
 */
export function AppShell({
  activeNav,
  onNavChange,
  pageTitle,
  greeting,
  userName,
  children,
  overlay,
  userId,
  onQuickLogged,
}: AppShellProps) {
  return (
    <QuickLogProvider userId={userId} onLogged={onQuickLogged}>
      <div className="flex min-h-screen bg-background">
        <SidebarNav activeNav={activeNav} onNavChange={onNavChange} />

        <main className="flex-1 flex flex-col min-w-0">
          <TopBar pageTitle={pageTitle} greeting={greeting} userName={userName} />

          {/* `pb-28` reserves room for the floating mobile tab pill (h ≈ 56px + 12px gap). */}
          <div className="flex-1 px-5 md:px-8 py-6 space-y-6 pb-28 md:pb-10">
            {children}
          </div>
        </main>

        <MobileTabBar activeNav={activeNav} onNavChange={onNavChange} />
        {overlay}
      </div>
    </QuickLogProvider>
  )
}
