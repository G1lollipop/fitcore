import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n/provider'
import { QueryProvider } from '@/components/providers/query-provider'
import './globals.css'

// Trim font weights to what we actually render — meaningful TTFB win.
// (Inter previously shipped 9 weights × 2 charsets; Space Grotesk shipped 5.)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['500', '700'],
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eaf3f0' },
    { media: '(prefers-color-scheme: dark)', color: '#13201e' },
  ],
}

export const metadata: Metadata = {
  title: 'FitCore — Smart Fitness Assistant',
  description: 'Track your nutrition and training, and get personalized fitness advice',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning is required because next-themes injects the
    // `class="dark"` attribute via inline script before React hydrates,
    // which would otherwise mismatch the server-rendered `<html>`.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <QueryProvider>
              {children}
              <Toaster />
            </QueryProvider>
          </LanguageProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
