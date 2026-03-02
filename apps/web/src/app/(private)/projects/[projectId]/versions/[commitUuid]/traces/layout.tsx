'use server'

import { ReactNode } from 'react'
import buildMetatags from '$/app/_lib/buildMetatags'
import { MetadataProvider } from '$/components/MetadataProvider'
import ProjectLayout from '../_components/ProjectLayout'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Traces',
    locationDescription: 'Project Traces',
  })
}

export default async function TracesLayout({
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
