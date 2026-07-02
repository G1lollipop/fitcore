'use client'

import { useSettings } from '@/components/settings/settings-context'
import { useT } from '@/lib/i18n/provider'

interface AccountMenuProps {
  userName: string
}

/**
 * Account avatar button. Clicking it opens the Settings sheet directly.
 * On mobile it renders inline as the leftmost element inside the floating
 * tab-bar pill; on desktop the same entry point lives in the sidebar footer
 * via the UserProfile row.
 */
export function AccountMenu({ userName }: AccountMenuProps) {
  const t = useT()
  const { open: openSettings } = useSettings()
  const displayName = userName || t.sidebar.myAccount
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <button
      type="button"
      onClick={openSettings}
      aria-label={t.sidebar.account}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {initial}
    </button>
  )
}
