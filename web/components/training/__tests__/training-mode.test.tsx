/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TrainingMode } from '@/components/training/training-mode'
import type { PlanDay } from '@/lib/plans/types'
import { saveTrainingSession, createTrainingSession, logSet } from '@/lib/training/session-state'
import { finishTrainingSession } from '@/app/actions/training'
import { getTodayDate } from '@/lib/utils/date'

vi.mock('@/app/actions/training', () => ({
  // By default the server stores whatever snapshot it is sent.
  finishTrainingSession: vi.fn(async (input: { revision: number }) => ({
    success: true,
    workoutLogId: 'w-1',
    revision: input.revision,
  })),
}))

type SaveResult = Awaited<ReturnType<typeof finishTrainingSession>>

/** A save whose reply the test delivers when it chooses to. */
function pendingSave() {
  let resolve!: (result: SaveResult) => void
  const promise = new Promise<SaveResult>((r) => {
    resolve = r
  })
  vi.mocked(finishTrainingSession).mockImplementationOnce(() => promise)
  return { reply: (result: SaveResult) => act(async () => resolve(result)) }
}

/** Log the next set of the first exercise through the on-screen form. */
function logFirstExerciseSet(container: HTMLElement, weight: string, reps: string) {
  const weightInput = container.querySelector('input[placeholder="kg"]') as HTMLInputElement
  const repsInput = container.querySelector('input[placeholder="reps"]') as HTMLInputElement
  fireEvent.change(weightInput, { target: { value: weight } })
  fireEvent.change(repsInput, { target: { value: reps } })
  fireEvent.submit(weightInput.closest('form')!)
}

function storedSession() {
  const raw = localStorage.getItem(`fitcore-training-session:user-1:plan-1::2026-07-08`)
  return raw ? JSON.parse(raw) : null
}

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
        saveFailed: 'Could not save your workout.',
        saveConflict: 'Already saved with different sets.',
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
    // Also drop any queued one-off replies, so a failing test cannot hand its
    // leftovers to the next one.
    vi.mocked(finishTrainingSession).mockReset()
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

  it('Finish clears the saved session and calls onFinish once the save succeeds', async () => {
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    const key = `fitcore-training-session:user-1:plan-1::${getTodayDate()}`

    fireEvent.click(screen.getByText('Finish Training'))

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('Finish keeps the saved session and shows an error when the save fails', async () => {
    vi.mocked(finishTrainingSession).mockResolvedValueOnce({
      success: false,
      error: 'DB_INSERT_FAILED',
    })
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    const key = `fitcore-training-session:user-1:plan-1::${getTodayDate()}`

    fireEvent.click(screen.getByText('Finish Training'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your workout.')
    expect(onFinish).not.toHaveBeenCalled()
    expect(localStorage.getItem(key)).toBeTruthy()
    // The button is usable again so the user can retry.
    expect(screen.getByText('Finish Training').closest('button')).not.toBeDisabled()
  })

  it('a retry resends the same request id, then clears the session once confirmed', async () => {
    vi.mocked(finishTrainingSession).mockResolvedValueOnce({
      success: false,
      error: 'DB_INSERT_FAILED',
    })
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    const key = `fitcore-training-session:user-1:plan-1::${getTodayDate()}`

    fireEvent.click(screen.getByText('Finish Training'))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByText('Finish Training'))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))

    const [first, second] = vi.mocked(finishTrainingSession).mock.calls.map(([input]) => input)
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(second.requestId).toBe(first.requestId)
    expect(localStorage.getItem(key)).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reuses the request id of a session restored after the app was closed', async () => {
    const seeded = createTrainingSession('plan-1', makeThreeExerciseDay())
    saveTrainingSession(seeded, {
      userId: 'user-1',
      planId: 'plan-1',
      dayId: '',
      date: getTodayDate(),
    })
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    fireEvent.click(screen.getByText('Finish Training'))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))

    expect(vi.mocked(finishTrainingSession).mock.calls[0][0].requestId).toBe(seeded.requestId)
  })

  it('Finish keeps the saved session when the save request throws', async () => {
    vi.mocked(finishTrainingSession).mockRejectedValueOnce(new Error('network down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    const key = `fitcore-training-session:user-1:plan-1::${getTodayDate()}`

    fireEvent.click(screen.getByText('Finish Training'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    expect(localStorage.getItem(key)).toBeTruthy()
    errorSpy.mockRestore()
  })

  it('retries the same snapshot after a lost response, then clears the session', async () => {
    // The save may well have committed; the screen only sees the request fail.
    vi.mocked(finishTrainingSession).mockRejectedValueOnce(new Error('fetch failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    logFirstExerciseSet(container, '70', '10')

    fireEvent.click(screen.getByText('Finish Training'))
    await screen.findByRole('alert')
    expect(storedSession().exercises[0].completedSets).toHaveLength(1)

    fireEvent.click(screen.getByText('Finish Training'))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))

    // Same id and same revision: the server recognises the same snapshot.
    const [first, second] = vi.mocked(finishTrainingSession).mock.calls.map(([input]) => input)
    expect(second).toEqual(first)
    expect(second.revision).toBe(1)
    expect(storedSession()).toBeNull()
    errorSpy.mockRestore()
  })

  it('keeps a set logged while a save is in flight, and saves it before finishing', async () => {
    const firstSave = pendingSave()
    const secondSave = pendingSave()
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    fireEvent.click(screen.getByText('Finish Training'))
    // The first save (no sets yet) is on its way; the user logs a set meanwhile.
    logFirstExerciseSet(container, '70', '10')
    await firstSave.reply({ success: true, workoutLogId: 'w-1', revision: 0 })

    // The confirmed save did not include that set: nothing is cleared or
    // closed. The newer snapshot goes out instead, under the same request id.
    await waitFor(() => expect(finishTrainingSession).toHaveBeenCalledTimes(2))
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession().exercises[0].completedSets).toHaveLength(1)
    const [first, second] = vi.mocked(finishTrainingSession).mock.calls.map(([input]) => input)
    expect(first.revision).toBe(0)
    expect(first.exercises[0].completedSets).toEqual([])
    expect(second.requestId).toBe(first.requestId)
    expect(second.revision).toBe(1)
    expect(second.exercises[0].completedSets).toEqual([{ setNumber: 1, weightKg: 70, reps: 10 }])

    // Only once the server holds everything on screen does the session go.
    await secondSave.reply({ success: true, workoutLogId: 'w-1', revision: 1 })
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
    expect(storedSession()).toBeNull()
  })

  it('keeps a set logged during a save when saving it then fails', async () => {
    const firstSave = pendingSave()
    vi.mocked(finishTrainingSession).mockResolvedValueOnce({
      success: false,
      error: 'DB_INSERT_FAILED',
    })
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    fireEvent.click(screen.getByText('Finish Training'))
    logFirstExerciseSet(container, '70', '10')
    await firstSave.reply({ success: true, workoutLogId: 'w-1', revision: 0 })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession().revision).toBe(1)
    expect(storedSession().exercises[0].completedSets).toHaveLength(1)
    expect(screen.getByText(/70kg/)).toBeInTheDocument()
  })

  it('a late reply does not clear a session that was resumed and edited meanwhile', async () => {
    const firstSave = pendingSave()
    const onFinish = vi.fn()
    const first = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    fireEvent.click(screen.getByText('Finish Training'))

    // Back out while the save is in flight, resume, and log a set.
    first.unmount()
    const resumed = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    logFirstExerciseSet(resumed.container, '70', '10')

    await firstSave.reply({ success: true, workoutLogId: 'w-1', revision: 0 })

    // The reply confirms the older snapshot only: the resumed session and its
    // new set stay, and the screen showing them is not closed.
    expect(storedSession().revision).toBe(1)
    expect(storedSession().exercises[0].completedSets).toHaveLength(1)
    expect(onFinish).not.toHaveBeenCalled()
    expect(screen.getByText(/70kg/)).toBeInTheDocument()
  })

  it('does not clear the session when the reply is about a revision that was not submitted', async () => {
    vi.mocked(finishTrainingSession).mockResolvedValueOnce({
      success: true,
      workoutLogId: 'w-1',
      revision: 5,
    })
    const onFinish = vi.fn()
    render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    fireEvent.click(screen.getByText('Finish Training'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession()).not.toBeNull()
  })

  it('a reply reporting revision 2 does not clear local revision 2 when revision 1 was submitted', async () => {
    const firstSave = pendingSave()
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)

    // Revision 1 is submitted; a second set then takes the screen to revision 2.
    logFirstExerciseSet(container, '70', '10')
    fireEvent.click(screen.getByText('Finish Training'))
    logFirstExerciseSet(container, '75', '8')
    expect(vi.mocked(finishTrainingSession).mock.calls[0][0].revision).toBe(1)
    expect(storedSession().revision).toBe(2)

    // The reply says revision 2 is stored — someone else's revision 2: this
    // screen's second set has never been sent anywhere.
    await firstSave.reply({ success: true, workoutLogId: 'w-1', revision: 2 })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession().revision).toBe(2)
    expect(storedSession().exercises[0].completedSets).toHaveLength(2)
    expect(screen.getByText(/75kg/)).toBeInTheDocument()
  })

  it('keeps the session and shows a conflict when the server holds a different save', async () => {
    vi.mocked(finishTrainingSession).mockResolvedValueOnce({
      success: false,
      error: 'SAVE_CONFLICT',
    })
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    logFirstExerciseSet(container, '70', '10')

    fireEvent.click(screen.getByText('Finish Training'))

    // A conflict is told apart from an ordinary failed save.
    expect(await screen.findByRole('alert')).toHaveTextContent('Already saved with different sets.')
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession().revision).toBe(1)
    expect(storedSession().exercises[0].completedSets).toHaveLength(1)
    expect(screen.getByText(/70kg/)).toBeInTheDocument()
    expect(screen.getByText('Finish Training').closest('button')).not.toBeDisabled()
  })

  it('keeps sets logged during a save that comes back as a conflict', async () => {
    const firstSave = pendingSave()
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    logFirstExerciseSet(container, '70', '10')

    fireEvent.click(screen.getByText('Finish Training'))
    logFirstExerciseSet(container, '75', '8')
    await firstSave.reply({ success: false, error: 'SAVE_CONFLICT' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Already saved with different sets.')
    expect(onFinish).not.toHaveBeenCalled()
    expect(storedSession().exercises[0].completedSets).toHaveLength(2)
  })

  it("does not clear another tab's copy that has the same revision but different sets", async () => {
    const onFinish = vi.fn()
    const { container } = render(<TrainingMode {...baseProps} onFinish={onFinish} />)
    logFirstExerciseSet(container, '70', '10')

    // Another tab, working from the same session, logged a different first set
    // and wrote its copy to the shared storage last.
    const key = `fitcore-training-session:user-1:plan-1::${getTodayDate()}`
    const otherTab = storedSession()
    otherTab.exercises[0].completedSets[0].weightKg = 100
    localStorage.setItem(key, JSON.stringify(otherTab))

    // This tab's save is confirmed (default reply: stored as sent).
    fireEvent.click(screen.getByText('Finish Training'))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))

    // Same request id, same revision — but not what was saved, so it stays.
    expect(vi.mocked(finishTrainingSession).mock.calls[0][0].revision).toBe(otherTab.revision)
    expect(storedSession()).toEqual(otherTab)
  })
})
