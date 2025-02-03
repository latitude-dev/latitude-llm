import {
  Commit,
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import {
  fetchDocumentLogsWithEvaluationResults,
  findDocumentLogWithEvaluationResultPage,
} from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
import {
  computeEvaluationResultsWithMetadata,
  findEvaluationResultWithMetadataPage,
} from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { findCommitCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { EvaluationResults } from './_components/EvaluationResults'
import { ManualEvaluationResultsClient } from './_components/ManualEvaluationResults'
import { fetchEvaluationCached } from './_lib/fetchEvaluationCached'
import env from '$/env'

export default async function ConnectedEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationId: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId, commitUuid, evaluationId } = await params
  const evaluation = await fetchEvaluationCached(Number(evaluationId))
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })
  const refinementEnabled = env.LATITUDE_CLOUD

  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return (
      <ManualEvaluationResults
        commit={commit}
        evaluation={evaluation}
        params={await params}
        searchParams={await searchParams}
        refinementEnabled={refinementEnabled}
      />
    )
  }

  return (
    <LlmAsJudgeEvaluationResults
      commit={commit}
      evaluation={evaluation}
      params={await params}
      searchParams={await searchParams}
      refinementEnabled={refinementEnabled}
    />
  )
}

async function LlmAsJudgeEvaluationResults({
  params: { projectId, documentUuid },
  searchParams: { pageSize, page, resultUuid },
  evaluation,
  commit,
  refinementEnabled,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: QueryParams
  evaluation: EvaluationDto
  commit: Commit
  refinementEnabled: boolean
}) {
  if (resultUuid) {
    const targetPage = await findEvaluationResultWithMetadataPage({
      workspaceId: evaluation.workspaceId,
      evaluation,
      documentUuid,
      draft: commit,
      resultUuid: resultUuid as string,
      pageSize: pageSize as string | undefined,
    }).then((p) => p?.toString())

    if (targetPage && page !== targetPage) {
      const route = ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail(evaluation.id).root

      const targetSearchParams = new URLSearchParams()
      targetSearchParams.set('page', targetPage)
      if (pageSize) targetSearchParams.set('pageSize', pageSize as string)
      targetSearchParams.set('resultUuid', resultUuid as string)

      return redirect(`${route}?${targetSearchParams}`)
    }
  }

  const rows = await computeEvaluationResultsWithMetadata({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid,
    draft: commit,
    page: page as string | undefined,
    pageSize: pageSize as string | undefined,
  })

  const selectedResult = rows.find((r) => r.uuid === resultUuid)

  return (
    <EvaluationResults
      evaluation={evaluation}
      evaluationResults={rows}
      selectedResult={selectedResult}
      refinementEnabled={refinementEnabled}
    />
  )
}

async function ManualEvaluationResults({
  params: { projectId, documentUuid },
  searchParams: { pageSize, page, documentLogId },
  evaluation,
  commit,
  refinementEnabled,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: QueryParams
  evaluation: EvaluationDto
  commit: Commit
  refinementEnabled: boolean
}) {
  if (documentLogId) {
    const targetPage = await findDocumentLogWithEvaluationResultPage({
      workspaceId: evaluation.workspaceId,
      documentUuid,
      commit,
      documentLogId: documentLogId as string,
      pageSize: pageSize as string | undefined,
    }).then((p) => p?.toString())

    if (targetPage && page !== targetPage) {
      const route = ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail(evaluation.id).root

      const targetSearchParams = new URLSearchParams()
      targetSearchParams.set('page', targetPage)
      if (pageSize) targetSearchParams.set('pageSize', pageSize as string)
      targetSearchParams.set('documentLogId', documentLogId as string)

      return redirect(`${route}?${targetSearchParams}`)
    }
  }

  const rows = await fetchDocumentLogsWithEvaluationResults({
    evaluation,
    documentUuid,
    commit,
    page: page as string | undefined,
    pageSize: pageSize as string | undefined,
  })

  const selectedLog = rows.find((l) => l.id === Number(documentLogId))

  return (
    <ManualEvaluationResultsClient
      evaluation={evaluation}
      documentLogs={rows}
      selectedLog={selectedLog}
      refinementEnabled={refinementEnabled}
    />
  )
}
