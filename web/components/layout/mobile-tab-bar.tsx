'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

interface MobileTabBarProps {
  activeNav: string
  onNavChange: (id: string) => void
}

/**
 * Floating pill bottom-tab bar (mobile, < md). Sits 1rem above the screen
 * edge with a frosted-glass effect — feels closer to a native iOS tab bar
 * than the previous full-width strip.
 *
 * Active tab gets a solid primary pill; inactive tabs are muted. Memoized
 * tab items so toggling the active id only re-renders two items.
 */
export function MobileTabBar({ activeNav, onNavChange }: MobileTabBarProps) {
  return (
    <nav
      aria-label="主导航"
      className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40"
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card/85 backdrop-blur-xl shadow-lg shadow-black/5 dark:shadow-black/40 px-1.5 py-1.5">
        {NAV_ITEMS.map((item) => (
          <TabItem
            key={item.id}
            id={item.id}
            label={item.shortLabel}
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
        'flex items-center gap-1.5 rounded-full transition-all',
        isActive
          ? 'bg-primary text-primary-foreground px-3.5 py-2'
          : 'text-muted-foreground hover:text-foreground px-2.5 py-2'
      )}
    >
      <Icon size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
      {isActive && (
        <span className="text-[11px] font-medium leading-none">{label}</span>
      )}
    </button>
  )
})
