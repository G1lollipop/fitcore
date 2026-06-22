import {
  Calendar,
  Dumbbell,
  LayoutDashboard,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'

type NavKey = keyof Dictionary['nav']

export interface NavItem {
  id: string
  /** Dictionary key (under `nav`) for the full label. */
  labelKey: NavKey
  /** Dictionary key (under `nav`) for the compact mobile-tab label. */
  shortLabelKey: NavKey
  icon: LucideIcon
}

/**
 * Single source of truth for the dashboard's primary navigation.
 * Used by `<SidebarNav>` (desktop), `<MobileTabBar>` (mobile), and the
 * page-title resolution in `dashboard-client`.
 *
 * Labels are resolved through the active dictionary at render time
 * (`t.nav[item.labelKey]`), so they follow the selected language.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', labelKey: 'dashboard', shortLabelKey: 'shortDashboard', icon: LayoutDashboard },
  { id: 'nutrition', labelKey: 'nutrition', shortLabelKey: 'shortNutrition', icon: UtensilsCrossed },
  { id: 'training', labelKey: 'training', shortLabelKey: 'shortTraining', icon: Dumbbell },
  { id: 'plans', labelKey: 'plans', shortLabelKey: 'shortPlans', icon: Calendar },
] as const

/** Lookup helper. Returns `undefined` for unknown ids. */
export function findNavItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => n.id === id)
}
