import {
  isOnboardingCompleted,
  getNecessaryOnboardingSteps,
  getOnboardingResources,
} from '$/data-access'
import { ROUTES } from '$/services/routes'
import { OnboardingClient } from './_components/OnboardingClient'
import { redirect } from 'next/navigation'

export default async function NocodersPage() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }
  const resources = await getOnboardingResources()
  if (resources.project === null || resources.commit === null) {
    return redirect(ROUTES.onboarding.agents.selectAgent)
  }

  const onboardingSteps = await getNecessaryOnboardingSteps()

  return <OnboardingClient onboardingSteps={onboardingSteps} />
}
