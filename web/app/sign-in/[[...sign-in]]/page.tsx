import { AuthTabs } from '@/app/auth-tabs'
import { AuthForm } from '@/app/auth-form'

export default function SignInPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AuthTabs active="sign-in" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <AuthForm mode="sign-in" />
        </div>
      </div>
    </div>
  )
}
