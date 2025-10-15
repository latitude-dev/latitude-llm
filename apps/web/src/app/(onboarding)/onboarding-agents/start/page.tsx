import { getNecessaryOnboardingSteps } from '$/data-access'
import { OnboardingClient } from './_components/OnboardingClient'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'

export default async function NocodersPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()
  const onboardingSteps = await getNecessaryOnboardingSteps()

  return (
    <PageTrackingWrapper
      namePageVisited='agentOnboarding'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <OnboardingClient onboardingSteps={onboardingSteps} />
    </PageTrackingWrapper>
  )
}
