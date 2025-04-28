import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { ExperimentsPageContent } from './_components/ExperimentsPage'

export default async function ExperimentsLayout({
  params,
}: {
  params: Promise<{
    documentUuid: string
  }>
}) {
  const { workspace } = await getCurrentUser()
  const { documentUuid } = await params

  const experimentsScope = new ExperimentsRepository(workspace.id)
  const count = await experimentsScope.countByDocumentUuid(documentUuid)

  return <ExperimentsPageContent initialCount={count} />
}
