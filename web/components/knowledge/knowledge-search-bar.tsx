'use client'

import { Search, X } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface KnowledgeSearchBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onClear?: () => void
  isStreaming: boolean
}

export function KnowledgeSearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  isStreaming,
}: KnowledgeSearchBarProps) {
  const t = useT()

  return (
    <div className="glass glass-highlight flex items-center gap-2 rounded-2xl px-4 py-3 transition-colors focus-within:border-primary/40">
      <Search size={18} className="shrink-0 text-primary" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        placeholder={t.knowledge.searchPlaceholder}
        aria-label={t.knowledge.searchPlaceholder}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t.common.close}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isStreaming || !value.trim()}
        className={cn(
          'shrink-0 rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {isStreaming ? t.knowledge.searching : t.knowledge.search}
      </button>
    </div>
  )
}
