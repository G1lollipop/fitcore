'use client'

import Link from 'next/link'
import { Languages } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/provider'

/**
 * Sign in / Sign up tab switcher shared by the auth pages. Pre-login pages are
 * server components, so this small client island reads the persisted language
 * preference to localize the two tab labels. It also carries the language
 * toggle, since the auth screens render no app chrome of their own — without it
 * a visitor landing here would have no way to switch the UI to English.
 */
export function AuthTabs({ active }: { active: 'sign-in' | 'sign-up' }) {
  const { language, mounted, toggleLanguage, t } = useLanguage()
  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={toggleLanguage}
        aria-label={t.language.switchTo}
        title={t.language.switchTo}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 text-sm font-medium text-zinc-400 transition-colors hover:text-white hover:bg-zinc-700/50"
      >
        <Languages size={16} />
        <span className="min-w-[1.6rem] text-center" aria-hidden>
          {mounted ? (language === 'zh' ? 'EN' : '中') : ''}
        </span>
      </button>
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
