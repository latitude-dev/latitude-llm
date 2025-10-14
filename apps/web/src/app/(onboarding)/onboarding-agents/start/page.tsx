import {
  isOnboardingCompleted,
  getNecessaryOnboardingSteps,
  getOnboardingResources,
} from '$/data-access'
import { ROUTES } from '$/services/routes'
import { OnboardingClient } from './_components/OnboardingClient'
import { redirect } from 'next/navigation'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'

export default async function NocodersPage() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }
  const { project, commit } = await getOnboardingResources()
  if (project === null || commit === null) {
    return redirect(ROUTES.onboarding.agents.selectAgent)
  }

  const onboardingSteps = await getNecessaryOnboardingSteps()

  return (
    <PageTrackingWrapper namePageVisited='agentOnboarding'>
      <OnboardingClient onboardingSteps={onboardingSteps} />
    </PageTrackingWrapper>
  )
}
