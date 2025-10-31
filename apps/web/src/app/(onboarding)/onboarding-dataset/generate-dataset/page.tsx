import { DatasetOnboardingStepRoot } from '../../_lib/OnboardingStep'
import { GenerateDatasetBody } from './_components/GenerateDataset'
import OnboardingHeader from '../_components/OnboardingHeader'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import buildMetatags from '$/app/_lib/buildMetatags'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'

export async function generateMetadata() {
  // TODO(onboarding): change this to prompt engineering onboarding title once we activate the onboarding
  return buildMetatags({
    title: 'Dataset Onboarding - Generate Dataset',
  })
}

export default async function GenerateDatasetPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()

  return (
    <PageTrackingWrapper
      namePageVisited='generateDatasetOnboarding'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <div className='flex flex-col flex-1 h-full w-full'>
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <GenerateDatasetBody />
        </DatasetOnboardingStepRoot>
      </div>
    </PageTrackingWrapper>
  )
}
