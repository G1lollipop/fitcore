import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial from-orange-500/20 via-transparent to-transparent" />
      
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-700/10 via-transparent to-transparent" />
      
      <div className="absolute top-4 right-4 z-50">
        <div className="flex items-center gap-2 px-1 py-1 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <Link
            href="/sign-in"
            className="px-4 py-2 rounded-md text-sm font-medium bg-orange-500 text-white transition-colors"
          >
            登录
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors"
          >
            注册
          </Link>
        </div>
      </div>
      
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          <SignIn 
            appearance={{
              variables: {
                colorPrimary: '#f97316',
                colorText: 'white',
                colorTextOnPrimaryBackground: 'white',
                colorTextSecondary: '#a1a1aa',
                colorBackground: '#18181b',
                colorInputBackground: '#fafafa',
                colorInputText: '#18181b',
                colorInputPlaceholder: '#71717a',
                colorDanger: '#ef4444',
                colorSuccess: '#22c55e',
                colorWarning: '#eab308',
                borderRadius: '8px',
              },
              elements: {
                rootBox: 'w-full',
                card: {
                  backgroundColor: '#18181b',
                  boxShadow: '0 0 40px rgba(249, 115, 22, 0.2)',
                  border: '1px solid #3f3f46',
                },
                header: {
                  color: 'white',
                },
                headerTitle: {
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: 'bold',
                },
                headerSubtitle: {
                  color: '#a1a1aa',
                  fontSize: '14px',
                },
                socialButtonsBlockButton: {
                  backgroundColor: '#27272a',
                  borderColor: '#3f3f46',
                  color: 'white',
                },
                socialButtonsBlockButtonText: {
                  color: 'white',
                },
                formButtonPrimary: {
                  backgroundColor: '#f97316',
                  color: 'white',
                },
                formFieldLabel: {
                  color: 'white',
                  fontWeight: '500',
                },
                formFieldInput: {
                  backgroundColor: '#fafafa',
                  color: '#18181b',
                  borderColor: '#3f3f46',
                },
                formFieldInputShowPasswordButton: {
                  color: '#71717a',
                },
                footer: {
                  display: 'none',
                },
                footerAction: {
                  color: '#a1a1aa',
                },
                footerActionLink: {
                  color: '#f97316',
                },
                dividerLine: {
                  backgroundColor: '#3f3f46',
                },
                dividerText: {
                  color: '#71717a',
                },
                identityPreview: {
                  backgroundColor: '#27272a',
                  borderColor: '#3f3f46',
                },
                identityPreviewText: {
                  color: 'white',
                },
                identityPreviewEditButton: {
                  color: '#f97316',
                },
                formFieldInputCheckbox: {
                  color: '#f97316',
                },
                formFieldInputCheckboxCircle: {
                  color: '#f97316',
                },
                otpCodeFieldInput: {
                  backgroundColor: '#fafafa',
                  color: '#18181b',
                  borderColor: '#3f3f46',
                },
              },
            }}
            routing="path"
            path="/sign-in"
          />
        </div>
      </div>
    </div>
  )
}
