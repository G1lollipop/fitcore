'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Leaf, Loader2 } from 'lucide-react'
import { createAuthBrowserClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'

/**
 * Combined email/password + Google auth form, shared by the sign-in and
 * sign-up pages (toggled via `mode`).
 *
 * Google is the primary path (OAuth → /auth/callback exchanges the code for a
 * session). Email/password is kept as a convenient offline/dev path. All calls
 * go through the browser Supabase client; the session cookie it sets is then
 * read server-side by middleware and `requireUserId()`.
 */
export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const t = useT()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const isSignUp = mode === 'sign-up'

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    const supabase = createAuthBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message || t.auth.genericError)
      setLoading(false)
    }
    // On success the browser is redirected to Google, so no further work here.
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    const supabase = createAuthBrowserClient()

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) {
          setError(error.message || t.auth.genericError)
          return
        }
        // Email confirmation disabled → session present → straight in.
        // Confirmation enabled → no session → tell the user to check email.
        if (data.session) {
          router.push('/')
          router.refresh()
        } else {
          setInfo(t.auth.checkEmail)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setError(error.message || t.auth.genericError)
          return
        }
        router.push('/')
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-strong glass-highlight rounded-2xl p-6 md:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Leaf className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            FitCore
          </span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp ? t.auth.signUpSubtitle : t.auth.signInSubtitle}
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        <GoogleIcon />
        {t.auth.continueWithGoogle}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">{t.auth.or}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.auth.emailLabel}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.auth.emailPlaceholder}
            className="h-11 w-full rounded-lg border border-input bg-card/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.auth.passwordLabel}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.auth.passwordPlaceholder}
            className="h-11 w-full rounded-lg border border-input bg-card/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-success">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? t.auth.processing : isSignUp ? t.auth.submitSignUp : t.auth.submitSignIn}
        </button>
      </form>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}
