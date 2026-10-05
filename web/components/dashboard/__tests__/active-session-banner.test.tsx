/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveSessionBanner } from '@/components/dashboard/active-session-banner'

vi.mock('@/lib/i18n/provider', () => ({
  useT: () => ({
    training: { mode: { inProgress: 'Workout in progress', resume: 'Resume' } },
  }),
}))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    motion: {
      button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    },
  }
})

describe('ActiveSessionBanner', () => {
  it('renders the in-progress label and day name', () => {
    render(
      <ActiveSessionBanner
        startedAt={new Date(Date.now() - 120_000)}
        dayName="Push Day"
        onResume={vi.fn()}
      />
    )
    expect(screen.getByText('Workout in progress')).toBeInTheDocument()
    expect(screen.getByText('Push Day')).toBeInTheDocument()
  })

  it('calls onResume when clicked', () => {
    const onResume = vi.fn()
    render(
      <ActiveSessionBanner
        startedAt={new Date()}
        dayName="Leg Day"
        onResume={onResume}
      />
    )
    const button = screen.getByText('Workout in progress').closest('button')
    expect(button).toBeTruthy()
    button!.click()
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('displays a live elapsed timer', () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    render(
      <ActiveSessionBanner
        startedAt={oneMinuteAgo}
        dayName="Push Day"
        onResume={vi.fn()}
      />
    )
    // Should show at least "00:" (at least zero minutes)
    const timerText = screen.getByText(/^\d{2}:\d{2}$/)
    expect(timerText).toBeInTheDocument()
  })
})
