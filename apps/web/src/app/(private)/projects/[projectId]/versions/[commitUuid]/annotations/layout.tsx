'use server'

import buildMetatags from '$/app/_lib/buildMetatags'
import { MetadataProvider } from '$/components/MetadataProvider'
import { ReactNode } from 'react'
import ProjectLayout from '../_components/ProjectLayout'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Annotations',
    locationDescription: 'Project Annotations',
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

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <MetadataProvider>{children}</MetadataProvider>
    </ProjectLayout>
  )
}
