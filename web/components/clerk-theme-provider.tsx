'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { useTheme } from 'next-themes'
import { useEffect, useState, type ReactNode } from 'react'

interface ClerkThemeProviderProps {
  children: ReactNode
}

/**
 * Wraps <ClerkProvider> so its appearance follows next-themes. Must live inside
 * <ThemeProvider> for useTheme() to resolve. The mounted gate avoids a
 * hydration mismatch — Clerk's modals are rendered client-side on demand, so
 * by the time the user opens one the resolved theme is in sync.
 */
export function ClerkThemeProvider({ children }: ClerkThemeProviderProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: '#3a7d44',
          colorTextOnPrimaryBackground: '#ffffff',
          borderRadius: '0.625rem',
        },
        elements: {
          formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
          card: 'bg-card border border-border shadow-sm',
          headerTitle: 'text-foreground font-semibold',
          headerSubtitle: 'text-muted-foreground',
          socialButtonsBlockButton:
            'bg-secondary border border-border text-foreground hover:bg-secondary/80',
          formFieldInput: 'bg-input border-border text-foreground',
          footerActionLink: 'text-primary hover:text-primary/80',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
