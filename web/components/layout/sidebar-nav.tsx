'use client'

import { memo } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  Leaf,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'
import { useT } from '@/lib/i18n/provider'
import { useSettings } from '@/components/settings/settings-context'
import { NAV_ITEMS } from './nav-items'

interface SidebarNavProps {
  activeNav: string
  onNavChange: (id: string) => void
  userName: string
}

/**
 * Desktop-only collapsible icon rail (md+). Two widths:
 *   • collapsed → 64px, icon-only with tooltip on hover
 *   • expanded  → 240px, icon + label
 *
 * Width transition is pure CSS — nothing inside the rail re-renders when
 * the user toggles, so the animation stays smooth even on slow devices.
 *
 * Mobile (<md) is hidden — `<MobileTabBar>` takes over there.
 */
export function SidebarNav({ activeNav, onNavChange, userName }: SidebarNavProps) {
  const router = useRouter()
  const t = useT()
  const [collapsed, toggle] = useSidebarCollapsed()
  const { open: openSettings } = useSettings()
  const displayName = userName || t.sidebar.myAccount

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
      <aside
        data-collapsed={collapsed}
        className={cn(
          'hidden md:flex flex-col shrink-0 bg-sidebar backdrop-blur-xl border-r border-sidebar-border h-screen sticky top-0 transition-[width] duration-300 ease-out',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* ── Logo ── */}
        <div
          className={cn(
            'flex items-center gap-2.5 border-b border-sidebar-border h-16 transition-[padding] duration-300',
            collapsed ? 'px-3 justify-center' : 'px-5'
          )}
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shrink-0">
            <Leaf className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
          </span>
          {!collapsed && (
            <span className="font-display font-semibold text-base text-foreground tracking-tight">
              FitCore
            </span>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              id={item.id}
              label={t.nav[item.labelKey]}
              icon={item.icon}
              isActive={activeNav === item.id}
              collapsed={collapsed}
              onClick={onNavChange}
            />
          ))}
        </nav>

        {/* ── User profile + collapse toggle ── */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          <UserProfile collapsed={collapsed} userName={displayName} onClick={openSettings} />
          <ReassessButton
            collapsed={collapsed}
            onClick={() => router.push('/onboarding?reassess=true')}
          />
          <CollapseToggle collapsed={collapsed} onClick={toggle} />
        </div>
      </aside>
    </TooltipProvider>
  )
}

/* -------------------------------------------------------------------------- */
/*  Subcomponents                                                             */
/* -------------------------------------------------------------------------- */

interface NavItemProps {
  id: string
  label: string
  icon: LucideIcon
  isActive: boolean
  collapsed: boolean
  onClick: (id: string) => void
}

/**
 * Memoized so toggling activeNav only re-renders the previously-active and
 * newly-active items, not the whole rail.
 */
const NavItem = memo(function NavItem({
  id,
  label,
  icon: Icon,
  isActive,
  collapsed,
  onClick,
}: NavItemProps) {
  const button = (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group w-full flex items-center gap-3 rounded-lg text-sm transition-colors',
        collapsed ? 'h-10 justify-center px-0' : 'h-10 px-3',
        isActive
          ? 'bg-primary/12 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      )}
    >
      <Icon size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
})

interface UserProfileProps {
  collapsed: boolean
  userName: string
  onClick: () => void
}

const UserProfile = memo(function UserProfile({ collapsed, userName, onClick }: UserProfileProps) {
  const t = useT()
  const initial = userName.trim().charAt(0).toUpperCase() || '?'

  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
      {initial}
    </span>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={t.sidebar.account}
            className="flex h-9 w-full items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {avatar}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs">
          {userName}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.sidebar.account}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {avatar}
      <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{userName}</p>
    </button>
  )
})

interface ReassessButtonProps {
  collapsed: boolean
  onClick: () => void
}

const ReassessButton = memo(function ReassessButton({ collapsed, onClick }: ReassessButtonProps) {
  const t = useT()
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
        collapsed ? 'h-9 justify-center px-0' : 'h-9 px-3'
      )}
    >
      <RefreshCw size={13} className="shrink-0" />
      {!collapsed && <span>{t.sidebar.reassess}</span>}
    </button>
  )

  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {t.sidebar.reassess}
      </TooltipContent>
    </Tooltip>
  )
})

interface CollapseToggleProps {
  collapsed: boolean
  onClick: () => void
}

const CollapseToggle = memo(function CollapseToggle({ collapsed, onClick }: CollapseToggleProps) {
  const t = useT()
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? t.sidebar.expand : t.sidebar.collapseSidebar}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
        collapsed ? 'h-9 justify-center px-0' : 'h-9 px-3'
      )}
    >
      {collapsed ? (
        <ChevronsRight size={14} className="shrink-0" />
      ) : (
        <ChevronsLeft size={14} className="shrink-0" />
      )}
      {!collapsed && <span>{t.sidebar.collapse}</span>}
    </button>
  )

  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="text-xs">
        {t.sidebar.expand}
      </TooltipContent>
    </Tooltip>
  )
})
