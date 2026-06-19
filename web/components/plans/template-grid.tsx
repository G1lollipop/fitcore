'use client'

import { motion } from 'framer-motion'
import { Calendar, Copy, LibraryBig, Sparkles } from 'lucide-react'
import { useState, useTransition } from 'react'
import { copyTemplateToUser } from '@/app/actions/plans'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tLabel, tError } from '@/lib/i18n'
import type { Database } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

type WorkoutPlan = Database['public']['Tables']['workout_plans']['Row']

interface TemplateGridProps {
  templates: WorkoutPlan[]
  userId?: string
  onCopied?: () => void
  className?: string
}

/**
 * Two-column grid of system templates. Each card has a copy CTA that
 * routes through `copyTemplateToUser` and notifies the parent so it can
 * refresh the user's plan list.
 */
export function TemplateGrid({
  templates,
  userId,
  onCopied,
  className,
}: TemplateGridProps) {
  const t = useT()
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={LibraryBig}
        title={t.plans.template.emptyTitle}
        description={t.plans.template.emptyDesc}
        size="inset"
        className={className}
      />
    )
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 md:grid-cols-2',
        className
      )}
    >
      {templates.map((template, idx) => (
        <TemplateCard
          key={template.id}
          template={template}
          delay={idx * 0.04}
          userId={userId}
          onCopied={onCopied}
        />
      ))}
    </div>
  )
}

interface TemplateCardProps {
  template: WorkoutPlan
  delay: number
  userId?: string
  onCopied?: () => void
}

function TemplateCard({ template, delay, userId, onCopied }: TemplateCardProps) {
  const { toast } = useToast()
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  const goalLabel = tLabel(t.labels.goals, template.goal)
  const levelLabel = tLabel(t.labels.levels, template.experience_level)

  const handleCopy = () => {
    if (!userId) {
      toast({
        variant: 'destructive',
        title: t.plans.template.loginRequired,
        description: t.plans.template.loginCopyDesc,
      })
      return
    }
    startTransition(async () => {
      const result = await copyTemplateToUser(template.id, template.name)
      if (result.success) {
        setCopied(true)
        toast({
          title: t.plans.template.copySuccess,
          description: t.plans.template.copySuccessDesc,
        })
        onCopied?.()
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.template.copyFailed,
          description: typeof result.error === 'string' ? tError(t, result.error) : t.plans.list.tryLater,
        })
      }
    })
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay }}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <header>
        <h4 className="font-display text-sm font-semibold text-foreground">
          {template.name}
        </h4>
        {template.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        )}
      </header>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {goalLabel && (
          <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {goalLabel}
          </span>
        )}
        {levelLabel && (
          <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {levelLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Calendar size={10} />
          {t.plans.template.freqPerWeek(template.frequency_per_week)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={isPending || copied}
        className={cn(
          'mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium transition-colors',
          copied
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'text-foreground hover:border-primary/40 hover:text-primary'
        )}
      >
        {copied ? (
          <>
            <Sparkles size={12} />
            {t.plans.template.added}
          </>
        ) : (
          <>
            <Copy size={12} />
            {isPending ? t.plans.template.copying : t.plans.template.copyToPlans}
          </>
        )}
      </button>
    </motion.article>
  )
}
