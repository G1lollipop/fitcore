'use client'

/** Three bouncing dots, used while waiting for the first SSE token. */
export function TypingIndicator() {
  return (
    <div className="flex gap-1 items-end px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}
