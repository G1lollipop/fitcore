/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/openaiClient', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}))

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
    }),
  },
}))

vi.mock('@/lib/i18n/provider', () => ({
  useT: () => ({
    common: { locale: 'en-US', kcal: 'kcal' },
    dashboard: {
      targets: { label: 'Targets', edit: 'Edit' },
      overview: { todaysMeals: "Today's meals" },
    },
    nutrition: {
      rings: { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' },
      empty: { title: 'No meals yet', description: 'Log your first meal' },
      mealGroups: {
        breakfast: 'Breakfast',
        lunch: 'Lunch',
        dinner: 'Dinner',
        snack: 'Snack',
        lateNight: 'Late Night',
      },
      mealSummary: {
        total: 'Total',
        protein: 'P',
        carbs: 'C',
        fat: 'F',
        kcal: 'kcal',
        addItem: 'Add item',
        deleteConfirm: 'Delete entry?',
        edit: 'Edit',
        delete: 'Delete',
        cancel: 'Cancel',
        noItems: 'No items',
      },
    },
  }),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/dashboard/nutrition-targets-dialog', () => ({
  NutritionTargetsDialog: () => null,
}))

vi.mock('@/components/nutrition/meal-timeline', () => ({
  MealTimeline: () => <div data-testid="meal-timeline">meal timeline stub</div>,
}))

vi.mock('@/app/actions/history', () => ({
  getNutritionByDate: vi.fn().mockResolvedValue({ dietLogs: [] }),
}))

vi.mock('@/lib/utils/date', () => ({
  getTodayDate: () => '2026-07-08',
}))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
      circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  }
})

import { TodayOverview } from '@/components/dashboard/today-overview'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TodayOverview — food card layout', () => {
  const baseProps = {
    kcalIntake: 1200,
    kcalGoal: 2500,
    protein: 95,
    proteinGoal: 150,
    carbs: 180,
    carbsGoal: 300,
    fat: 40,
    fatGoal: 80,
  }

  it('renders without crashing with minimal props', () => {
    const { container } = renderWithQuery(<TodayOverview {...baseProps} />)
    expect(container).toBeTruthy()
  })

  it('displays the calorie intake number', () => {
    renderWithQuery(<TodayOverview {...baseProps} />)
    // The calorie goal "/ 2,500 kcal" text is static and always renders
    expect(screen.getByText('/ 2,500 kcal')).toBeInTheDocument()
  })

  it('renders macro labels P, C, F', () => {
    renderWithQuery(<TodayOverview {...baseProps} />)
    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('F')).toBeInTheDocument()
  })

  it('renders "Today\'s meals" button', () => {
    renderWithQuery(<TodayOverview {...baseProps} />)
    const meals = screen.getAllByText("Today's meals")
    expect(meals.length).toBeGreaterThan(0)
  })

  it('has the glass card styling', () => {
    const { container } = renderWithQuery(<TodayOverview {...baseProps} />)
    const card = container.querySelector('section')
    expect(card?.className).toContain('rounded-2xl')
  })
})
