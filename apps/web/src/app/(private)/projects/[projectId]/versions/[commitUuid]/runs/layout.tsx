'use server'

import { isFeatureEnabledCached } from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { MetadataProvider } from '$/components/MetadataProvider'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import ProjectLayout from '../_components/ProjectLayout'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Runs',
    locationDescription: 'Project Runs Overview',
  })
}

export default async function RunsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  const runsEnabled = await isFeatureEnabledCached('runs')
  if (!runsEnabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid }).agent.root,
    )
  }

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <MetadataProvider>{children}</MetadataProvider>
    </ProjectLayout>
  )
}
