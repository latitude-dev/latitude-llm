import { ReactNode } from 'react'
import ProjectLayout from '../_components/ProjectLayout'

export default async function PreviewPage({
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
      {modal}
      {children}
    </ProjectLayout>
  )
}
