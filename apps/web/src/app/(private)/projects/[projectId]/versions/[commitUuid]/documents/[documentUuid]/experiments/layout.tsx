import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { ExperimentsPageContent } from './_components/ExperimentsPage'
import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata = buildMetatags({
  locationDescription: 'Prompt Experiments Page',
})

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
