'use server'

import { getEvaluationV2AtCommitByDocumentCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  EvaluationType,
  LlmEvaluationMetric,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { EditorPage as ClientEditorPage } from './_components/EditorPage'

export default async function EditorPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId, commitUuid, documentUuid, evaluationUuid } = await params

  const { workspace } = await getCurrentUser()

  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
    evaluationUuid: evaluationUuid,
  })
  if (
    evaluation.type !== EvaluationType.Llm ||
    evaluation.metric !== LlmEvaluationMetric.Custom
  ) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluationsV2.detail({ uuid: evaluationUuid }).root,
    )
  }

  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <ClientEditorPage
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      copilotEnabled={env.LATITUDE_CLOUD}
    />
  )
}
