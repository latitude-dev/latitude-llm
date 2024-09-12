import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default function EvaluationsPage({
  params: { projectId, documentUuid, commitUuid },
}: {
  params: { projectId: string; documentUuid: string; commitUuid: string }
}) {
  redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).evaluations.dashboard.root,
  )
}
