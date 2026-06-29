import {
  CalendarRange,
  Dumbbell,
  Flame,
  Moon,
  Pill,
  Salad,
  type LucideIcon,
} from 'lucide-react'

export interface KnowledgeTopic {
  id: string
  label: string
  icon: LucideIcon
  /** Seed questions surfaced as one-tap starters in the empty state. */
  questions: string[]
}

/**
 * Curated topic + starter-question seed for the Knowledge Exploration Center's
 * empty state. Kept as plain constants (the corpus and answers are English) so
 * the i18n dictionary only carries UI chrome.
 */
export const KNOWLEDGE_TOPICS: readonly KnowledgeTopic[] = [
  {
    id: 'muscle',
    label: 'Build muscle',
    icon: Dumbbell,
    questions: [
      'How many sets per muscle per week maximize hypertrophy?',
      'Does training to failure build more muscle?',
      'How much protein do I need to build muscle?',
    ],
  },
  {
    id: 'fatloss',
    label: 'Fat loss',
    icon: Flame,
    questions: [
      'How large should a calorie deficit be for fat loss?',
      'Does cardio or weight training burn more fat?',
      'How do I keep muscle while losing fat?',
    ],
  },
  {
    id: 'supplements',
    label: 'Supplements',
    icon: Pill,
    questions: [
      'Is creatine effective and how should I take it?',
      'Does caffeine improve workout performance?',
      'Do I need beta-alanine or citrulline?',
    ],
  },
  {
    id: 'programming',
    label: 'Programming',
    icon: CalendarRange,
    questions: [
      'How long should I rest between sets?',
      'Is a full-body or split routine better for beginners?',
      'How should I periodize my training?',
    ],
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    icon: Salad,
    questions: [
      'How important is meal timing for results?',
      'How much carbohydrate do I need around training?',
      'What is the role of fiber in a fitness diet?',
    ],
  },
  {
    id: 'recovery',
    label: 'Recovery',
    icon: Moon,
    questions: [
      'How does sleep affect muscle recovery?',
      'What helps reduce muscle soreness after training?',
      'How many rest days per week do I need?',
    ],
  },
] as const
