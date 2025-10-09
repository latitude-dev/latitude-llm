'use server'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { env } from '@latitude-data/env'
import BasicHeader from '../../_components/BasicHeader/BasicHeader'
import { getOnboardingResources } from '$/data-access/workspaceOnboarding'
import { redirect } from 'next/navigation'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'

export default async function NocodersLayout({
  children,
}: {
  children: ReactNode
}) {
  const { user } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD

  const resources = await getOnboardingResources()
  if (resources.project === null || resources.commit === null) {
    return redirect(ROUTES.onboarding.agents.selectAgent)
  }

  const { project, commit } = resources // TODO(onboarding): if this is null, what happens?

  return (
    <ProjectProvider project={project}>
      <CommitProvider project={project} commit={commit} isHead={false}>
        <div className={'flex flex-col h-screen overflow-hidden relative'}>
          <BasicHeader currentUser={user} isCloud={isCloud} />
          {children}
        </div>
      </CommitProvider>
    </ProjectProvider>
  )
}
