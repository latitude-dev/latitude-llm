'use server'

import { listEvaluationsV2AtCommitByDocumentCached } from '$/app/(private)/_data-access'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { EvaluationsPage as ClientEvaluationsPage } from './_components/EvaluationsPage'

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params

  const { workspace } = await getCurrentUser()
  const flags = getFeatureFlagsForWorkspaceCached({ workspace })

  if (!flags.evaluationsV2.enabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).evaluations.dashboard.root,
    )
  }

  const evaluations = await listEvaluationsV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
  })

  return (
    <ClientEvaluationsPage
      evaluations={evaluations}
      generatorEnabled={env.LATITUDE_CLOUD}
    />
  )
}
