'use client'

import type { ReactNode } from 'react'
import { SidebarNav } from './sidebar-nav'
import { MobileTabBar } from './mobile-tab-bar'
import { QuickLogProvider } from '@/components/log-form/quick-log-provider'
import { CoachProvider } from '@/components/ai-chat/coach-context'
import { MealPhotoProvider } from '@/components/log-form/meal-photo-context'
import { SettingsProvider } from '@/components/settings/settings-context'

interface AppShellProps {
  activeNav: string
  onNavChange: (id: string) => void
  userName: string
  /** Renders to the right of the sidebar. */
  children: ReactNode
  /** Optional floating overlay slot (used for the AI chat widget). */
  overlay?: ReactNode
  /** Auth'd user id, passed down to the floating quick-log command bar. */
  userId?: string
  /** Fired after a successful quick-log submission so the page can refetch. */
  onQuickLogged?: () => void
  /** Fired after profile/goals are saved in Settings so the page can refetch. */
  onProfileSaved?: () => void
}

/**
 * Outer chrome for the dashboard. Composes the desktop sidebar rail, the
 * scrollable content region, and the mobile floating chrome (a single centered
 * tab-bar pill whose leftmost element is the account avatar). There is no top
 * header bar.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [SidebarRail] │  Scroll region (children)      │
 *   │               │                                │
 *   │   md+ only    │             …                  │
 *   │               │                                │
 *   │               │  ┌──────────────────────────┐  │  ← MobileTabBar floats
 *   │               │  │ ⦿ | [tab][tab][tab][tab] │  │     bottom-center on mobile
 *   │               │  └──────────────────────────┘  │     (avatar merged in)
 *   └────────────────────────────────────────────────┘
 *
 * The previous version inlined all of this into `app/page.tsx`. Pulling it
 * into a dedicated component lets future pages (settings, knowledge base)
 * reuse the same shell without copy-paste.
 */
export function AppShell({
  activeNav,
  onNavChange,
  userName,
  children,
  overlay,
  userId,
  onQuickLogged,
  onProfileSaved,
}: AppShellProps) {
  return (
    <QuickLogProvider userId={userId} onLogged={onQuickLogged}>
      <CoachProvider>
        <MealPhotoProvider>
          <SettingsProvider onSaved={onProfileSaved}>
          <div className="flex min-h-screen">
            <SidebarNav activeNav={activeNav} onNavChange={onNavChange} userName={userName} />

            <main className="flex-1 flex flex-col min-w-0">
              {/* `pb-28` reserves room for the floating mobile tab pill (h ≈ 56px + 12px gap). */}
              <div className="flex-1 px-5 md:px-8 pt-4 md:pt-6 pb-28 md:pb-10 space-y-6">
                {children}
              </div>
            </main>

            <MobileTabBar activeNav={activeNav} onNavChange={onNavChange} userName={userName} />
            {overlay}
          </div>
          </SettingsProvider>
        </MealPhotoProvider>
      </CoachProvider>
    </QuickLogProvider>
  )
}
