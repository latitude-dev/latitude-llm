import { ReactNode } from 'react'
import ProjectLayout from '../_components/ProjectLayout'
import { Client } from './client'

export default async function PreviewPage({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <Client />

      {children}
    </ProjectLayout>
  )
}
