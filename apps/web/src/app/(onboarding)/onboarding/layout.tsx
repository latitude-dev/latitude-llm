'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ReactNode } from 'react'
import { env } from '@latitude-data/env'
import NocodersHeader from './_components/NocodersHeader'
import { getOnboardingResources } from '$/data-access/workspaceOnboarding'
import { notFound } from 'next/navigation'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { ProjectProvider } from '$/app/providers/ProjectProvider'

export default async function NocodersLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD

  const resources = await getOnboardingResources()
  if (!resources) {
    return notFound()
  }
  const { project, commit } = resources

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <ProjectProvider project={project}>
          <CommitProvider project={project} commit={commit} isHead={false}>
            <div className={'flex flex-col h-screen overflow-hidden relative'}>
              <NocodersHeader currentUser={user} isCloud={isCloud} />
              {children}
            </div>
          </CommitProvider>
        </ProjectProvider>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
