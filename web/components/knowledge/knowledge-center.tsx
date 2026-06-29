'use client'

import { motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { KnowledgeSearchBar } from './knowledge-search-bar'
import { KnowledgeStarters } from './knowledge-starters'
import { KnowledgeHistory } from './knowledge-history'
import { RagTransparency } from './rag-transparency'
import { KnowledgeAnswer } from './knowledge-answer'
import { KnowledgeSources } from './knowledge-sources'
import { useKnowledgeStream } from './hooks/use-knowledge-stream'
import { useKnowledgeHistory } from './hooks/use-knowledge-history'

/**
 * Knowledge Exploration Center — the fifth dashboard tab.
 *
 * A Perplexity-style, explainable, evidence-grounded Q&A surface over the RAG
 * knowledge base: ask a question → stream a cited answer, with a transparency
 * panel exposing the retrieval internals. The empty state offers topic starters
 * and recent searches.
 */
export function KnowledgeCenter() {
  const t = useT()
  const [input, setInput] = useState('')
  const { state, search, reset } = useKnowledgeStream()
  const { history, add: addHistory, clear: clearHistory } = useKnowledgeHistory()

  const isStreaming = state.status === 'streaming'
  const hasResult = state.status !== 'idle'

  const runSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed || isStreaming) return
      setInput(trimmed)
      addHistory(trimmed)
      search(trimmed)
    },
    [isStreaming, addHistory, search]
  )

  const handleClear = useCallback(() => {
    setInput('')
    reset()
  }, [reset])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          {t.knowledge.title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.knowledge.subtitle}</p>
      </div>

      <KnowledgeSearchBar
        value={input}
        onChange={setInput}
        onSubmit={() => runSearch(input)}
        onClear={hasResult || input ? handleClear : undefined}
        isStreaming={isStreaming}
      />

      {!hasResult ? (
        <div className="space-y-6">
          <KnowledgeStarters onPick={runSearch} />
          <KnowledgeHistory history={history} onPick={runSearch} onClear={clearHistory} />
        </div>
      ) : (
        <motion.div
          key={state.query}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          {state.status === 'error' ? (
            <div className="glass flex items-center gap-2 rounded-2xl p-4 text-sm text-muted-foreground">
              <AlertCircle size={16} className="text-destructive" aria-hidden />
              {state.error ?? t.knowledge.error}
            </div>
          ) : (
            <>
              <RagTransparency meta={state.meta} backend={state.backend} />

              {state.meta?.abstained && (
                <div className="glass rounded-2xl border-l-2 border-amber-500/60 p-4 text-sm text-muted-foreground">
                  {t.knowledge.abstained}
                </div>
              )}

              {(state.answer || isStreaming) && (
                <KnowledgeAnswer answer={state.answer} isStreaming={isStreaming} />
              )}

              <KnowledgeSources sources={state.sources} />
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}
