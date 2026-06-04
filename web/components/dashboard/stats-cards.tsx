'use client'

import { TodayHero } from './today-hero'
import { WaterTracker } from './water-tracker'
import { DEFAULT_WATER_GOAL_ML } from '@/lib/metrics/water'

interface StatsCardsProps {
  userId?: string
  kcalIntake?: number
  kcalBurn?: number
  kcalGoal?: number
  workoutMinutes?: number
  waterIntake?: number
  waterGoal?: number
  onWaterLogged?: () => void
}

/**
 * Bento orchestrator for the dashboard "Today" view. Holds the kcal-balance
 * hero on the left and the animated water tracker on the right; collapses
 * to a single column on mobile.
 */
export function StatsCards({
  userId,
  kcalIntake = 0,
  kcalBurn = 0,
  kcalGoal = 2500,
  workoutMinutes = 0,
  waterIntake = 0,
  waterGoal = DEFAULT_WATER_GOAL_ML,
  onWaterLogged,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <TodayHero
        kcalIntake={kcalIntake}
        kcalBurn={kcalBurn}
        kcalGoal={kcalGoal}
        workoutMinutes={workoutMinutes}
        className="lg:col-span-8"
      />
      <WaterTracker
        userId={userId}
        initialMl={waterIntake}
        goalMl={waterGoal}
        onLogged={onWaterLogged}
        className="lg:col-span-4"
      />
    </div>
  )
}
