'use server'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import BasicHeader from '../../_components/BasicHeader/BasicHeader'
import { SelectAgents } from './_components/SelectAgents'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { WorkspaceProvider } from '$/app/providers/WorkspaceProvider'

export default async function SelectAgentPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD

  return (
    <PageTrackingWrapper
      namePageVisited='selectAgent'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <WorkspaceProvider workspace={workspace}>
        <div
          className={'flex flex-col h-screen overflow-hidden relative gap-y-16'}
        >
          <BasicHeader currentUser={user} isCloud={isCloud} />
          <SelectAgents user={user} />
        </div>
      </WorkspaceProvider>
    </PageTrackingWrapper>
  )
}
