import { Suspense } from "react"
import OnboardingForm from "./onboarding-form"
import { Loader2 } from "lucide-react"

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  )
}
