import { DatasetOnboardingStepRoot } from '../../_lib/OnboardingStep'
import RunExperimentBody from './_components/RunExperiment'
import OnboardingHeader from '../_components/OnboardingHeader'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import buildMetatags from '$/app/_lib/buildMetatags'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Prompt Engineering Onboarding - Run Experiment',
  })
}

export default async function RunExperimentPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()

  return (
    <PageTrackingWrapper
      namePageVisited='runExperimentOnboarding'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <div className='flex flex-col flex-1 h-full w-full'>
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <RunExperimentBody user={user} workspace={workspace} />
        </DatasetOnboardingStepRoot>
      </div>
    </PageTrackingWrapper>
  )
}
