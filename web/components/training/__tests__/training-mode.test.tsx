/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TrainingMode } from '@/components/training/training-mode'
import type { PlanDay } from '@/lib/plans/types'
import {
  saveTrainingSession,
  createTrainingSession,
  logSet,
  loadTrainingSession,
  clearTrainingSession,
} from '@/lib/training/session-state'
import { getTodayDate } from '@/lib/utils/date'

vi.mock('@/app/actions/training', () => ({
  finishTrainingSession: vi.fn().mockResolvedValue({ success: true, workoutLogId: 'w-1' }),
}))

vi.mock('@/lib/utils/date', () => ({
  getTodayDate: () => '2026-07-08',
}))

vi.mock('@/components/training/rest-timer', () => ({
  RestTimer: ({ onSkip, onComplete }: any) => (
    <div data-testid="rest-timer">
      <button onClick={onSkip}>Skip</button>
      <button onClick={onComplete}>Complete</button>
    </div>
  ),
}))

vi.mock('@/lib/i18n/provider', () => ({
  useT: () => ({
    training: {
      mode: {
        back: 'Back',
        exit: 'Exit',
        discardConfirm: 'Discard workout progress?',
      },
    },
  }),
}))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    },
  }
})

function makeDay(exercises: PlanDay['exercises'] = []): PlanDay {
  return {
    name: 'Push Day',
    rest_day: exercises.length === 0,
    exercises,
  }
}

function makeThreeExerciseDay(): PlanDay {
  return makeDay([
    { name: 'Bench Press', sets: 3, reps_min: 8, reps_max: 12, weight: 60 },
    { name: 'Squat', sets: 3, reps_min: 8, reps_max: 10, weight: 80 },
    { name: 'Deadlift', sets: 1, reps_min: 5, reps_max: 5, weight: 100 },
  ])
}

describe('TrainingMode — stacked exercises + persistence', () => {
  const day = makeThreeExerciseDay()
  const baseProps = {
    planId: 'plan-1',
    userId: 'user-1',
    day,
    onClose: vi.fn(),
    onFinish: vi.fn(),
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders all exercise names in the document', () => {
    render(<TrainingMode {...baseProps} />)
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Deadlift')).toBeInTheDocument()
  })

  it('does not render pill tab navigation', () => {
    render(<TrainingMode {...baseProps} />)
    const tabs = document.querySelectorAll('[class*="rounded-full"]')
    const exercisePillTabs = Array.from(tabs).filter(
      (el) =>
        el.textContent?.includes('Bench Press') ||
        el.textContent?.includes('Squat')
    )
    expect(exercisePillTabs.length).toBe(0)
  })

  it('renders a Finish Training button', () => {
    render(<TrainingMode {...baseProps} />)
    expect(screen.getByText('Finish Training')).toBeInTheDocument()
  })

  it('restores session from localStorage on mount', () => {
    const today = getTodayDate()
    // Pre-seed localStorage with a session that has 2 completed sets for exercise 0
    const seededDay = makeThreeExerciseDay()
    let session = createTrainingSession('plan-1', seededDay)
    session = logSet(session, 0, 1, 60, 8)
    session = logSet(session, 0, 2, 65, 10)
    saveTrainingSession(session, {
      userId: 'user-1',
      planId: 'plan-1',
      dayId: '',
      date: today,
    })

    render(<TrainingMode {...baseProps} />)

    expect(screen.getByText(/60kg/)).toBeInTheDocument()
    expect(screen.getByText(/65kg/)).toBeInTheDocument()
  })

  it('persists session to localStorage after logging a set', async () => {
    const today = getTodayDate()
    render(<TrainingMode {...baseProps} />)

    const key = `fitcore-training-session:user-1:plan-1::${today}`
    expect(localStorage.getItem(key)).toBeTruthy()

    const parsed = JSON.parse(localStorage.getItem(key)!)
    expect(parsed.planId).toBe('plan-1')
    expect(parsed.dayName).toBe('Push Day')
  })

  it('clears localStorage on finish', async () => {
    const today = getTodayDate()
    render(<TrainingMode {...baseProps} />)

    // Click Finish Training
    const finishBtn = screen.getByText('Finish Training')
    finishBtn.click()

    // Wait for the async action to resolve
    await vi.waitFor(() => {
      const key = `fitcore-training-session:user-1:plan-1::${today}`
      expect(localStorage.getItem(key)).toBeNull()
    })
  })

  it('calls onFinish after finishing', async () => {
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    const finishBtn = screen.getByText('Finish Training')
    finishBtn.click()

    await vi.waitFor(() => {
      expect(onFinish).toHaveBeenCalled()
    })
  })

  it('rest timer container is a shrink-0 sibling, not inside the overflow-y-auto scroll area', async () => {
    const { container } = render(<TrainingMode {...baseProps} />)

    const scrollArea = container.querySelector('.overflow-y-auto')
    expect(scrollArea).toBeTruthy()

    const weightInput = container.querySelector('input[placeholder="kg"]') as HTMLInputElement
    expect(weightInput).toBeTruthy()
    fireEvent.change(weightInput, { target: { value: '70' } })

    const repsInput = container.querySelector('input[placeholder="reps"]') as HTMLInputElement
    expect(repsInput).toBeTruthy()
    fireEvent.change(repsInput, { target: { value: '10' } })

    const form = weightInput.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByTestId('rest-timer')).toBeInTheDocument()
    })

    expect(scrollArea!.contains(screen.getByTestId('rest-timer'))).toBe(false)
    expect(scrollArea!.children.length).toBe(1)
  })

  it('renders a Back button (minimize) and an Exit button (discard)', () => {
    render(<TrainingMode {...baseProps} />)
    expect(screen.getByText('Back')).toBeInTheDocument()
    expect(screen.getByText('Exit')).toBeInTheDocument()
  })

  it('Back button calls onClose without clearing localStorage (minimize)', () => {
    const onClose = vi.fn()
    render(<TrainingMode {...baseProps} onClose={onClose} />)

    // Session should be saved on mount
    const today = getTodayDate()
    const key = `fitcore-training-session:user-1:plan-1::${today}`
    expect(localStorage.getItem(key)).toBeTruthy()

    screen.getByText('Back').click()
    expect(onClose).toHaveBeenCalledTimes(1)
    // Session should STILL be in localStorage (minimize, not discard)
    expect(localStorage.getItem(key)).toBeTruthy()
  })

  it('Exit button clears localStorage after confirm and calls onClose (discard)', async () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TrainingMode {...baseProps} onClose={onClose} />)

    const today = getTodayDate()
    const key = `fitcore-training-session:user-1:plan-1::${today}`
    expect(localStorage.getItem(key)).toBeTruthy()

    screen.getByText('Exit').click()

    await vi.waitFor(() => {
      expect(localStorage.getItem(key)).toBeNull()
    })
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('Exit button does NOT clear if user cancels confirm', () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TrainingMode {...baseProps} onClose={onClose} />)

    const today = getTodayDate()
    const key = `fitcore-training-session:user-1:plan-1::${today}`

    screen.getByText('Exit').click()
    expect(localStorage.getItem(key)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
