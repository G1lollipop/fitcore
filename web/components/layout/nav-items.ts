import {
  BookOpen,
  Calendar,
  Dumbbell,
  LayoutDashboard,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  /** Compact label used in the mobile floating tab bar. */
  shortLabel: string
  icon: LucideIcon
}

/**
 * Single source of truth for the dashboard's primary navigation.
 * Used by `<SidebarNav>` (desktop), `<MobileTabBar>` (mobile), and the
 * page-title resolution in `app/page.tsx`.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: '今日概览', shortLabel: '概览', icon: LayoutDashboard },
  { id: 'nutrition', label: '饮食中心', shortLabel: '饮食', icon: UtensilsCrossed },
  { id: 'training', label: '训练历史', shortLabel: '训练', icon: Dumbbell },
  { id: 'plans', label: '我的计划', shortLabel: '计划', icon: Calendar },
  { id: 'knowledge', label: '知识库', shortLabel: '知识', icon: BookOpen },
] as const

/** Lookup helper. Returns `undefined` for unknown ids. */
export function findNavItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => n.id === id)
}
