/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetLogger } from '@/components/training/set-logger'
import type { CompletedSet } from '@/lib/training/session-state'

describe('SetLogger — pre-rendered empty set rows', () => {
  const baseProps = {
    exerciseName: 'Bench Press',
    targetSets: 3,
    targetWeight: 60,
    targetRepsMin: 8,
    targetRepsMax: 12,
    completedSets: [] as CompletedSet[],
    onLogSet: vi.fn(),
  }

  it('renders "Target: 3 sets" label', () => {
    render(<SetLogger {...baseProps} />)
    const targetEl = screen.getByText(/Target:/)
    expect(targetEl).toBeInTheDocument()
    expect(targetEl.textContent).toContain('3')
  })

  it('renders 3 empty set rows when targetSets=3 and 0 completed', () => {
    render(<SetLogger {...baseProps} />)
    expect(screen.getByText('Set 1')).toBeInTheDocument()
    expect(screen.getByText('Set 2')).toBeInTheDocument()
    expect(screen.getByText('Set 3')).toBeInTheDocument()
  })

  it('renders completed sets and remaining empty rows', () => {
    const completed: CompletedSet[] = [
      { setNumber: 1, weightKg: 60, reps: 8, loggedAt: new Date() },
    ]
    render(<SetLogger {...baseProps} completedSets={completed} />)
    expect(screen.getByText(/60kg/)).toBeInTheDocument()
    expect(screen.getByText(/8 reps/)).toBeInTheDocument()
    expect(screen.getByText('Set 2')).toBeInTheDocument()
    expect(screen.getByText('Set 3')).toBeInTheDocument()
  })

  it('shows "Set N · extra" label when beyond targetSets', () => {
    const completed: CompletedSet[] = [
      { setNumber: 1, weightKg: 60, reps: 8, loggedAt: new Date() },
      { setNumber: 2, weightKg: 60, reps: 8, loggedAt: new Date() },
      { setNumber: 3, weightKg: 60, reps: 8, loggedAt: new Date() },
    ]
    render(<SetLogger {...baseProps} completedSets={completed} />)
    expect(screen.getByText('Set 4 · extra')).toBeInTheDocument()
  })

  it('shows "Add Set" button always', () => {
    render(<SetLogger {...baseProps} />)
    expect(screen.getByText('Add Set')).toBeInTheDocument()
  })

  it('"Add Set" button is visible even when beyond target', () => {
    const completed: CompletedSet[] = [
      { setNumber: 1, weightKg: 60, reps: 8, loggedAt: new Date() },
      { setNumber: 2, weightKg: 60, reps: 8, loggedAt: new Date() },
      { setNumber: 3, weightKg: 60, reps: 8, loggedAt: new Date() },
    ]
    render(<SetLogger {...baseProps} completedSets={completed} />)
    expect(screen.getByText('Add Set')).toBeInTheDocument()
  })

  it('calls onLogSet with correct setNumber when confirming an input row', async () => {
    const onLogSet = vi.fn()
    const user = userEvent.setup()
    render(
      <SetLogger
        {...baseProps}
        completedSets={[{ setNumber: 1, weightKg: 60, reps: 8, loggedAt: new Date() }]}
        onLogSet={onLogSet}
      />
    )

    const set2Form = document.querySelector('[data-set-number="2"]')
    expect(set2Form).toBeTruthy()
    if (set2Form) {
      const btn = set2Form.querySelector('button[type="submit"]')
      expect(btn).toBeTruthy()
      if (btn) await user.click(btn)
    }

    expect(onLogSet).toHaveBeenCalledWith(2, 60, 8)
  })

  it('shows weight and reps inputs for empty rows', () => {
    render(<SetLogger {...baseProps} />)
    const weightInputs = screen.getAllByPlaceholderText('kg')
    const repsInputs = screen.getAllByPlaceholderText('reps')
    expect(weightInputs.length).toBeGreaterThanOrEqual(3)
    expect(repsInputs.length).toBeGreaterThanOrEqual(3)
  })

  it('pre-fills target weight for empty rows', () => {
    render(<SetLogger {...baseProps} />)
    const firstWeightInput = screen.getAllByPlaceholderText('kg')[0] as HTMLInputElement
    expect(firstWeightInput.value).toBe('60')
  })

  it('pre-fills target repsMin for empty rows', () => {
    render(<SetLogger {...baseProps} />)
    const firstRepsInput = screen.getAllByPlaceholderText('reps')[0] as HTMLInputElement
    expect(firstRepsInput.value).toBe('8')
  })
})
