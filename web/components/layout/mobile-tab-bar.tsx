'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { NAV_ITEMS } from './nav-items'
import { AccountMenu } from './account-menu'

interface MobileTabBarProps {
  activeNav: string
  onNavChange: (id: string) => void
  userName: string
}

/**
 * Floating pill bottom-tab bar (mobile, < md). Sits 1rem above the screen
 * edge with a frosted-glass effect — feels closer to a native iOS tab bar
 * than the previous full-width strip.
 *
 * The account avatar (`AccountMenu`) is rendered inline as the leftmost
 * element inside the pill, followed by a thin divider, so the bottom chrome is
 * one clean centered cluster that never overlaps card content. The pill must
 * NOT use `overflow-hidden` so the account dropdown can escape upward.
 *
 * Active tab gets a solid primary pill; inactive tabs are muted. Memoized
 * tab items so toggling the active id only re-renders two items.
 */
export function MobileTabBar({ activeNav, onNavChange, userName }: MobileTabBarProps) {
  const t = useT()
  return (
    <nav
      aria-label={t.sidebar.mainNav}
      className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40"
    >
      <div className="glass flex items-center gap-1 rounded-full px-1.5 py-1.5">
        <AccountMenu userName={userName} />
        <span className="mx-0.5 h-5 w-px bg-border/60" />
        {NAV_ITEMS.map((item) => (
          <TabItem
            key={item.id}
            id={item.id}
            label={t.nav[item.shortLabelKey]}
            icon={item.icon}
            isActive={activeNav === item.id}
            onClick={onNavChange}
          />
        ))}
      </div>
    </nav>
  )
}

interface TabItemProps {
  id: string
  label: string
  icon: LucideIcon
  isActive: boolean
  onClick: (id: string) => void
}

const TabItem = memo(function TabItem({
  id,
  label,
  icon: Icon,
  isActive,
  onClick,
}: TabItemProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      className={cn(
        // `min-h-10` guarantees a ≥40px tap target on the primary mobile nav
        // while the pill stays visually slim.
        'flex min-h-10 items-center gap-1.5 rounded-full transition-all',
        isActive
          ? 'bg-primary text-primary-foreground px-3.5 py-2'
          : 'text-muted-foreground hover:text-foreground px-3 py-2'
      )}
    >
      <Icon size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
      {isActive && (
        <span className="text-[11px] font-medium leading-none">{label}</span>
      )}
    </button>
  )
})
