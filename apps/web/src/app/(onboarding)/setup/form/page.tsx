import { FocusLayout } from '$/components/layouts'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import SetupForm from './_components/SetupForm'
import { ROUTES } from '$/services/routes'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'

export default async function SetupFormPage() {
  const { workspace, user } = await getCurrentUserOrRedirect()
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

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
