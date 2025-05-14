import {
  findCommitCached,
  getDocumentByUuidCached,
  getEvaluationV2AtCommitByDocumentCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  EvaluationType,
  LlmEvaluationMetric,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { EvaluationEditor } from './_components/EvaluationEditor'
import { LOG_UUID_PARAM } from '$/lib/useEvaluationEditorLink'
import { DocumentLogsRepository } from '@latitude-data/core/repositories'

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
  const { workspace } = await getCurrentUser()
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

  const logUuid = queryParams[LOG_UUID_PARAM]?.toString()

  let selectedDocumentLogUuid: string | undefined = undefined

  if (logUuid) {
    const logsRepo = new DocumentLogsRepository(workspace.id)
    const logResult = await logsRepo.findByUuid(logUuid)
    if (!logResult.error) {
      selectedDocumentLogUuid = logResult.value.uuid
    }
  }

  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <EvaluationEditor
      document={document}
      commit={commit}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      selectedDocumentLogUuid={selectedDocumentLogUuid}
      copilotEnabled={env.LATITUDE_CLOUD}
    />
  )
}
