import { FocusLayout } from '$/components/layouts'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import Questionnaire from './_components/Questionnaire'
import { ROUTES } from '$/services/routes'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '@latitude-data/core/lib/Result'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { redirect } from 'next/navigation'

export default async function QuestionnairePage() {
  const { workspace } = await getCurrentUserOrRedirect()
  // TODO(onboarding): remove this once we activate the onboarding
  const isNewOnboardingEnabledResult = await isFeatureEnabledByName(
    workspace.id,
    'nocoderOnboarding',
  )

  if (!Result.isOk(isNewOnboardingEnabledResult)) {
    return isNewOnboardingEnabledResult
  }
  const isNewOnboardingEnabled = isNewOnboardingEnabledResult.unwrap()
  if (!isNewOnboardingEnabled) {
    return redirect(ROUTES.dashboard.root)
  }

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='How do you plan to use Latitude?'
          description='Your answer helps us personalize Latitude to your needs.'
        />
      }
    >
      <Questionnaire />
    </FocusLayout>
  )
}
