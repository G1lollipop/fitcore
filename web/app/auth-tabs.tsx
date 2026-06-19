'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

/**
 * Sign in / Sign up tab switcher shared by the auth pages. Pre-login pages are
 * server components, so this small client island reads the persisted language
 * preference to localize the two tab labels.
 */
export function AuthTabs({ active }: { active: 'sign-in' | 'sign-up' }) {
  const t = useT()
  return (
    <div className="absolute top-4 right-4 z-50">
      <div className="flex items-center gap-2 px-1 py-1 rounded-lg bg-zinc-800/50 border border-zinc-700">
        <Link
          href="/sign-in"
          className={
            active === 'sign-in'
              ? 'px-4 py-2 rounded-md text-sm font-medium bg-orange-500 text-white transition-colors'
              : 'px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors'
          }
        >
          {t.auth.signIn}
        </Link>
        <Link
          href="/sign-up"
          className={
            active === 'sign-up'
              ? 'px-4 py-2 rounded-md text-sm font-medium bg-orange-500 text-white transition-colors'
              : 'px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors'
          }
        >
          {t.auth.signUp}
        </Link>
      </div>
    </div>
  )
}
