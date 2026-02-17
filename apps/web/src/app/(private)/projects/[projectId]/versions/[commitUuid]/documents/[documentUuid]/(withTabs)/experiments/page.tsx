import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { computeProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { ExperimentsPageContent } from './_components/ExperimentsPage'
import { redirect } from 'next/navigation'

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId, commitUuid, documentUuid } = await params

  const productAccess = computeProductAccess(workspace)
  if (!productAccess.promptManagement) {
    redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).traces.root,
    )
  }

  const experimentsScope = new ExperimentsRepository(workspace.id)
  const count = await experimentsScope.countByDocumentUuid(documentUuid)

  return <ExperimentsPageContent initialCount={count} />
}
