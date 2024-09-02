import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function CommitRoot({
  params,
}: {
  params: { projectId: string; commitUuid: string }
}) {
  redirect(
    ROUTES.projects
      .detail({ id: Number(params.projectId) })
      .commits.detail({ uuid: params.commitUuid }).documents.root,
  )
}
