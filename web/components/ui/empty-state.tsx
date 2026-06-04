'use client'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** Icon glyph rendered inside a soft tinted halo at the top of the card. */
  icon?: LucideIcon
  title: string
  description?: ReactNode
  /**
   * `hero`   — large dashed card with a 28px icon, used for full-section
   *            empty states (e.g. "no plans yet").
   * `inset`  — slimmer card with a 20px icon, for empty states *inside*
   *            another card (e.g. "no meals today" inside Nutrition).
   * `inline` — text-only single-line message, for tight spots (e.g. an
   *            empty list cell inside a wizard step).
   */
  size?: 'hero' | 'inset' | 'inline'
  /** Optional CTA / footnote rendered below the description. */
  children?: ReactNode
  className?: string
}

/**
 * Standardised empty-state card. Replaces the inline ad-hoc dashed-border
 * messages that had drifted across plans / nutrition / training.
 *
 * Three sizes (`hero` | `inset` | `inline`) cover the audit findings:
 *   • `hero`   — section-level, like "还没有训练计划"
 *   • `inset`  — card-level, like the nutrition timeline's "no meals" card
 *   • `inline` — terse line, like wizard step warnings
 *
 * Animates in with the same `[0.16, 1, 0.3, 1]` ease as the rest of the
 * Calm Athletic surfaces.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  size = 'hero',
  children,
  className,
}: EmptyStateProps) {
  if (size === 'inline') {
    return (
      <motion.p
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-center text-xs text-muted-foreground',
          className,
        )}
      >
        {title}
        {description && (
          <span className="ml-1 text-muted-foreground/80">· {description}</span>
        )}
      </motion.p>
    )
  }

  const isHero = size === 'hero'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-center',
        isHero ? 'px-6 py-12' : 'px-5 py-8',
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground',
            isHero ? 'h-12 w-12' : 'h-10 w-10',
          )}
        >
          <Icon size={isHero ? 22 : 18} />
        </span>
      )}
      <p
        className={cn(
          'font-display mt-3 font-semibold text-foreground',
          isHero ? 'text-sm' : 'text-[13px]',
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn(
            'mt-1 max-w-sm text-muted-foreground',
            isHero ? 'text-xs' : 'text-[11px]',
          )}
        >
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  )
}
