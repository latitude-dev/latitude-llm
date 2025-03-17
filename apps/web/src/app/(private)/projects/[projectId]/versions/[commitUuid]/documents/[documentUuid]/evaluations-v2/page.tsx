import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  // TODO: Move here the evaluations list when all evaluations are migrated to V2
  const { projectId, commitUuid, documentUuid } = await params
  redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).evaluations.dashboard.root,
  )
}
