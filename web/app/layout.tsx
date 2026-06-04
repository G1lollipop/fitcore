import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { ClerkThemeProvider } from '@/components/clerk-theme-provider'
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
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#171a18' },
  ],
}

export const metadata: Metadata = {
  title: 'FitCore — 智能健身助手',
  description: '追踪饮食、训练，获取专属健身建议',
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
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkThemeProvider>
            {children}
            <Toaster />
            <Analytics />
          </ClerkThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
