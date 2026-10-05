// web/components/ai-chat/coach-avatar.tsx
import { cn } from '@/lib/utils'

interface CoachAvatarProps {
  /** Size in pixels (applied as both width and height). Default 28. */
  size?: number
  className?: string
}

/**
 * AI coach mascot avatar — a simple geometric fitness coach character.
 * Flat vector style, two-tone coloring via currentColor + opacity.
 * The gradient background is applied by the parent container.
 */
export function CoachAvatar({ size = 28, className }: CoachAvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {/* Head — rounded rectangle for a friendly face */}
      <rect x="6" y="7" width="20" height="17" rx="9" fill="currentColor" opacity="0.8" />

      {/* Headband / sweatband */}
      <rect x="6" y="7" width="20" height="4" rx="2" fill="currentColor" opacity="0.5" />
      <path d="M5 11 Q16 16 27 11" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" fill="none" />

      {/* Eyes — two dots */}
      <circle cx="13" cy="16" r="1.5" fill="currentColor" />
      <circle cx="19" cy="16" r="1.5" fill="currentColor" />

      {/* Smile — small arc */}
      <path d="M13 20.5 Q16 23 19 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Body — simple rounded trapezoid */}
      <path
        d="M10 24 L11 31 L21 31 L22 24 Z"
        fill="currentColor"
        opacity="0.35"
      />

      {/* Whistle cord — curved line */}
      <path d="M15 27 Q16 30 18 29" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" fill="none" />
    </svg>
  )
}
