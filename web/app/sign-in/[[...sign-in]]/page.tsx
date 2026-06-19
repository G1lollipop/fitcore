import { AuthTabs } from '@/app/auth-tabs'
import { AuthForm } from '@/app/auth-form'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-orange-500/20 via-transparent to-transparent" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-700/10 via-transparent to-transparent" />

      <AuthTabs active="sign-in" />

      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          <AuthForm mode="sign-in" />
        </div>
      </div>
    </div>
  )
}
