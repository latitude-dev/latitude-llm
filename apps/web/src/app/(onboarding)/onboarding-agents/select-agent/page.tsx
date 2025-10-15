'use server'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import BasicHeader from '../../_components/BasicHeader/BasicHeader'
import { SelectAgents } from './_components/SelectAgents'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access'

export default async function SelectAgentPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
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
