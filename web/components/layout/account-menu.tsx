'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogOut, Moon, RefreshCw, Settings, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { signOut } from '@/app/actions/auth'
import { useSettings } from '@/components/settings/settings-context'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface AccountMenuProps {
  userName: string
}

/**
 * Account avatar button that opens a lightweight custom dropdown with Settings,
 * theme toggle, Reassess and Sign out. On mobile it renders inline as the
 * leftmost element inside the floating tab-bar pill (see `MobileTabBar`); on
 * desktop the same actions live in the sidebar footer. The root is a `relative`
 * inline wrapper so the panel can open UPWARD via `absolute bottom-full`
 * (the parent pill must not clip it with `overflow-hidden`). There is no
 * popover/dropdown primitive in `components/ui`, so this is a hand-rolled panel
 * with click-outside + Escape to close (no new deps).
 */
export function AccountMenu({ userName }: AccountMenuProps) {
  const t = useT()
  const router = useRouter()
  const { open: openSettings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const displayName = userName || t.sidebar.myAccount
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  const close = useCallback(() => setIsOpen(false), [])

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t.sidebar.account}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {initial}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t.sidebar.account}
          className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          </div>

          <div className="p-1">
            <MenuButton
              icon={<Settings size={16} className="shrink-0" />}
              label={t.settings.open}
              onClick={() => {
                close()
                openSettings()
              }}
            />
            <ThemeMenuItem onSelect={close} />
            <MenuButton
              icon={<RefreshCw size={16} className="shrink-0" />}
              label={t.sidebar.reassess}
              onClick={() => {
                close()
                router.push('/onboarding?reassess=true')
              }}
            />
          </div>

          <div className="border-t border-border p-1">
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut size={16} className="shrink-0" />
                <span>{t.sidebar.signOut}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

interface MenuButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function MenuButton({ icon, label, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * Theme toggle rendered inline as a menu item. Hydration-safe: renders the
 * "switch to dark" affordance until mounted so the first paint is stable.
 */
function ThemeMenuItem({ onSelect }: { onSelect: () => void }) {
  const t = useT()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag to keep the icon hydration-safe (matches ThemeToggle)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <MenuButton
      icon={
        <span className={cn('shrink-0', !mounted && 'opacity-0')}>
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </span>
      }
      label={isDark ? t.theme.toLight : t.theme.toDark}
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark')
        onSelect()
      }}
    />
  )
}
