import buildMetatags from '$/app/_lib/buildMetatags'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { ExperimentsPageContent } from './_components/ExperimentsPage'

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
  const { workspace } = await getCurrentUserOrRedirect()
  const { documentUuid } = await params

  const experimentsScope = new ExperimentsRepository(workspace.id)
  const count = await experimentsScope.countByDocumentUuid(documentUuid)

  return <ExperimentsPageContent initialCount={count} />
}
