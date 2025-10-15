import { FocusLayout } from '$/components/layouts'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import SetupForm from './_components/SetupForm'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'

export default async function SetupFormPage() {
  const { workspace, user } = await getCurrentUserOrRedirect()
  return (
    <PageTrackingWrapper
      namePageVisited='setupForm'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <FocusLayout
        header={
          <FocusHeader
            title='How do you plan to use Latitude?'
            description='Your answer helps us personalize Latitude to your needs.'
          />
        }
      >
        <SetupForm />
      </FocusLayout>
    </PageTrackingWrapper>
  )
}
