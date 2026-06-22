'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useCoach } from '@/components/ai-chat/coach-context'
import { useT } from '@/lib/i18n/provider'

/**
 * The AI coach, promoted to the top of the home tab.
 *
 * Instead of hiding the coach behind a corner button, this hero makes it the
 * first thing the user sees: one input that both logs ("I ate 200g chicken")
 * and answers ("am I getting enough protein?"), plus tappable starter chips.
 * Submitting opens the coach panel and auto-sends the prompt.
 */
export function CoachHomeCard() {
  const t = useT()
  const coach = useCoach()
  const [text, setText] = useState('')

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      coach.open()
      return
    }
    coach.open(trimmed)
    setText('')
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass glass-highlight relative overflow-hidden rounded-2xl p-5 sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />

      <header className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            {t.aiChat.home.title}
          </h2>
          <p className="text-xs text-muted-foreground">{t.aiChat.home.subtitle}</p>
        </div>
      </header>

      <form
        className="relative mt-4 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-shadow focus-within:border-primary/60 focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.04)]"
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.aiChat.home.placeholder}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          aria-label={t.aiChat.home.cta}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t.aiChat.home.cta}
          <ArrowRight size={13} />
        </button>
      </form>

      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {t.aiChat.home.chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => submit(chip)}
            className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          >
            {chip}
          </button>
        ))}
      </div>
    </motion.section>
  )
}
