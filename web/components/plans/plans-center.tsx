'use client'

import { DietPlanCard } from './diet-plan-card'
import { MyPlans } from './my-plans'

interface PlansCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

/**
 * The Plans tab: the user's diet plan (daily nutrition targets) and their
 * training plans, both AI-operable. Today's workout itself is surfaced on the
 * home tab, so the training-plan section here focuses on management — the
 * today banner is hidden to avoid duplication.
 */
export function PlansCenter({ userId, onLogSuccess }: PlansCenterProps) {
  return (
    <div className="space-y-6">
      <DietPlanCard onSaved={onLogSuccess} />
      <MyPlans userId={userId} hideTodayBanner onCurrentPlanChange={onLogSuccess} />
    </div>
  )
}
