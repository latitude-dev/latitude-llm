import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{
    projectId: string
    documentUuid: string
    commitUuid: string
  }>
}) {
  const { projectId, documentUuid, commitUuid } = await params
  redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).evaluations.dashboard.root,
  )
}
