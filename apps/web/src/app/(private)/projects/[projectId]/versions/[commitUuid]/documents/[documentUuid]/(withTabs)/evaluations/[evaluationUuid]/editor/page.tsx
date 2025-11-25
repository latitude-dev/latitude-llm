import {
  findCommitCached,
  getDocumentByUuidCached,
  getEvaluationV2AtCommitByDocumentCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { EvaluationEditor } from './_components/EvaluationEditor'
import buildMetatags from '$/app/_lib/buildMetatags'
import {
  EvaluationType,
  LlmEvaluationMetric,
} from '@latitude-data/core/constants'

export const metadata = buildMetatags({
  locationDescription: 'Prompt Evaluation Editor',
})

export default async function EvaluationEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const {
    projectId: pjid,
    commitUuid,
    documentUuid,
    evaluationUuid,
  } = await params
  const projectId = Number(pjid)
  const queryParams = await searchParams
  const document = await getDocumentByUuidCached({
    documentUuid: documentUuid,
    projectId,
    commitUuid,
  })
  const providerApiKeys = await getProviderApiKeysCached()
  const { workspace } = await getCurrentUserOrRedirect()
  let commit
  try {
    commit = await findCommitCached({ projectId, uuid: commitUuid })
  } catch (error) {
    console.warn((error as Error).message)

    if (error instanceof NotFoundError) {
      return redirect(ROUTES.dashboard.root)
    }

    throw error
  }
  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
    evaluationUuid: evaluationUuid,
  })

  const hasEditor =
    evaluation.type == EvaluationType.Llm &&
    evaluation.metric.startsWith(LlmEvaluationMetric.Custom)

  if (!hasEditor) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail({ uuid: evaluationUuid }).root,
    )
  }

  const selectedSpanId = queryParams.spanId
  const selectedTraceId = queryParams.traceId
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <EvaluationEditor
      document={document}
      commit={commit}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      selectedSpanId={selectedSpanId as string | undefined}
      selectedTraceId={selectedTraceId as string | undefined}
      copilotEnabled={env.LATITUDE_CLOUD}
    />
  )
}
