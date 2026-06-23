'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

/**
 * Sign in / Sign up tab switcher shared by the auth pages. Pre-login pages are
 * server components, so this small client island renders the two tab links.
 */
export function AuthTabs({ active }: { active: 'sign-in' | 'sign-up' }) {
  const t = useT()
  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
      <div className="glass flex items-center gap-1 rounded-lg p-1">
        <Link
          href="/sign-in"
          className={
            active === 'sign-in'
              ? 'px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground transition-colors'
              : 'px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors'
          }
        >
          {t.auth.signIn}
        </Link>
        <Link
          href="/sign-up"
          className={
            active === 'sign-up'
              ? 'px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground transition-colors'
              : 'px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors'
          }
        >
          {t.auth.signUp}
        </Link>
      </div>
    </div>
  )
}
