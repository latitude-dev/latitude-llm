import {
  isOnboardingCompleted,
  getNecessaryOnboardingSteps,
} from '$/data-access'
import { ROUTES } from '$/services/routes'
import { OnboardingClient } from './_components/OnboardingClient'
import { redirect } from 'next/navigation'

export default async function NocodersPage() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }
  const onboardingSteps = await getNecessaryOnboardingSteps()

  return <OnboardingClient onboardingSteps={onboardingSteps} />
}
