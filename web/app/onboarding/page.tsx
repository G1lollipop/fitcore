import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Loader2 } from "lucide-react"
import OnboardingForm from "./onboarding-form"
import { createAuthServerClient } from "@/lib/supabase/server"
import { resolveDisplayName } from "@/lib/auth/display-name"

export default async function OnboardingPage() {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/sign-in")
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <OnboardingForm userName={resolveDisplayName(user)} />
    </Suspense>
  )
}
