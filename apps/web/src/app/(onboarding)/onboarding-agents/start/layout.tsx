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
import buildMetatags from '$/app/_lib/buildMetatags'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Onboarding AI Agents',
  })
}

export default async function NocodersLayout({
  children,
}: {
  children: ReactNode
}) {
  const { user } = await getCurrentUserOrRedirect()
  const isCloud = !!env.LATITUDE_CLOUD
  const { project, commit } = await getOnboardingResources()
  if (project === null || commit === null) {
    return redirect(ROUTES.onboarding.agents.selectAgent)
  }

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
