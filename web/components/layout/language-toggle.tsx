'use client'

import { memo } from 'react'
import { Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/provider'

interface LanguageToggleProps {
  className?: string
}

/**
 * Toggles the UI language between Chinese and English. Mirrors `ThemeToggle`:
 * renders a fixed-size placeholder until the persisted preference is read so
 * the first paint matches and the icon/label doesn't pop.
 */
export const LanguageToggle = memo(function LanguageToggle({
  className,
}: LanguageToggleProps) {
  const { language, mounted, toggleLanguage, t } = useLanguage()

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={t.language.switchTo}
      title={t.language.switchTo}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary',
        className
      )}
    >
      <Languages size={16} />
      <span className="min-w-[1.6rem] text-center" aria-hidden>
        {mounted ? (language === 'zh' ? 'EN' : '中') : ''}
      </span>
    </button>
  )
})
