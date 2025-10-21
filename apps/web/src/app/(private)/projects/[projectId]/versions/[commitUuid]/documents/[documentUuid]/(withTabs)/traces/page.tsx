import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { SpansRepository } from '@latitude-data/core/repositories'
import buildMetatags from '$/app/_lib/buildMetatags'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'

import { DocumentTracesPage } from './_components'
import { SpanType } from '@latitude-data/constants'

export const metadata = buildMetatags({
  locationDescription: 'Document Traces Page',
})

export default async function TracesPage({
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

  // Check if traces feature is enabled
  const isTracesEnabled = await isFeatureEnabledByName(
    workspace.id,
    'traces',
  ).then((r) => r.unwrap())

  if (!isTracesEnabled) {
    // Redirect to logs page if traces feature is not enabled
    const logsRoute = ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).logs.root
    redirect(logsRoute)
  }

  const spansRepository = new SpansRepository(workspace.id)
  const spans = await spansRepository
    .findByDocumentAndCommit({
      documentUuid,
      commitUuid,
      type: SpanType.Prompt,
    })
    .then((r) => r.unwrap())

  return <DocumentTracesPage spans={spans} />
}
