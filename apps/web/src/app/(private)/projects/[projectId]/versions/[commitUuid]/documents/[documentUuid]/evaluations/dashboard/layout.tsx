import {
  getEvaluationsByDocumentUuidCached,
  getEvaluationTemplatesCached,
  listEvaluationsV2AtCommitByDocumentCached,
} from '$/app/(private)/_data-access'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import EvaluationsLayoutClient from './_components/Layout'

export default async function EvaluationsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params

  const { workspace } = await getCurrentUser()
  const flags = getFeatureFlagsForWorkspaceCached({ workspace })

  if (flags.evaluationsV2.enabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).evaluationsV2.root,
    )
  }

  const evaluations = await getEvaluationsByDocumentUuidCached(documentUuid)
  const evaluationsV2 = await listEvaluationsV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
  })
  const evaluationTemplates = await getEvaluationTemplatesCached()

  return (
    <div className='w-full p-6'>
      {children}
      <EvaluationsLayoutClient
        evaluations={evaluations}
        evaluationsV2={evaluationsV2}
        templates={evaluationTemplates}
        isGeneratorEnabled={!!env.LATITUDE_CLOUD}
      />
    </div>
  )
}
