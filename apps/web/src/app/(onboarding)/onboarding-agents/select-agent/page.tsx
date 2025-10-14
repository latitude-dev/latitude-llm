'use server'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import BasicHeader from '../../_components/BasicHeader/BasicHeader'
import { SelectAgents } from './_components/SelectAgents'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '@latitude-data/core/lib/Result'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function SelectAgentPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD

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
    <PageTrackingWrapper
      namePageVisited='selectAgent'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <div
        className={'flex flex-col h-screen overflow-hidden relative gap-y-16'}
      >
        <BasicHeader currentUser={user} isCloud={isCloud} />
        <SelectAgents />
      </div>
    </PageTrackingWrapper>
  )
}
