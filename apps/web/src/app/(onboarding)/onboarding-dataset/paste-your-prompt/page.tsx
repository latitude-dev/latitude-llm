import { DatasetOnboardingStepRoot } from '../../_lib/OnboardingStep'
import { PasteYourPromptBody } from './_components/PasteYourPrompt'
import OnboardingHeader from '../_components/OnboardingHeader'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import buildMetatags from '$/app/_lib/buildMetatags'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'

export async function generateMetadata() {
  // TODO(onboarding): change this to prompt engineering onboarding title once we activate the onboarding
  return buildMetatags({
    title: 'Dataset Onboarding - Paste Your Prompt',
  })
}

export default async function PasteYourPromptPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()

  return (
    <PageTrackingWrapper
      namePageVisited='pasteYourPromptOnboarding'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <div className='flex flex-col flex-1 h-full w-full'>
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <PasteYourPromptBody />
        </DatasetOnboardingStepRoot>
      </div>
    </PageTrackingWrapper>
  )
}
