import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function CommitRoot({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params
  redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid }).documents.root,
  )
}
