import { ReactNode } from 'react'
import ProjectLayout from '../_components/ProjectLayout'
import { MetadataProvider } from '$/components/MetadataProvider'

export default async function AgentLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode
  modal: ReactNode
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <MetadataProvider>
        {modal}
        {children}
      </MetadataProvider>
    </ProjectLayout>
  )
}
