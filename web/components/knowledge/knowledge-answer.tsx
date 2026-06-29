'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { isHttpUrl } from '@/components/ai-chat/utils'

interface KnowledgeAnswerProps {
  answer: string
  isStreaming: boolean
}

/**
 * Renders the streamed answer as Markdown (GFM). A blinking caret trails the
 * text while tokens are still arriving.
 */
export function KnowledgeAnswer({ answer, isStreaming }: KnowledgeAnswerProps) {
  const t = useT()

  return (
    <section className="glass glass-highlight rounded-2xl p-5 sm:p-6">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-primary" aria-hidden />
        <h3 className="font-display text-base font-semibold text-foreground">
          {t.knowledge.answerTitle}
        </h3>
      </header>

      <div
        className="text-sm leading-relaxed text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        aria-live="polite"
        role="status"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) =>
              href && isHttpUrl(href) ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
          }}
        >
          {answer}
        </ReactMarkdown>
        {isStreaming && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground/60 align-middle"
          />
        )}
      </div>
    </section>
  )
}
