import { Client } from './client'
import ProjectLayout from '../_components/ProjectLayout'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <Client />
    </ProjectLayout>
  )
}
