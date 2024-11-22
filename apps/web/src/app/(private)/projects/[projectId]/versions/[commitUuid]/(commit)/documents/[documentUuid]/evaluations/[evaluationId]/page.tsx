import {
  Commit,
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { fetchDocumentLogsWithEvaluationResults } from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { findCommitCached } from '$/app/(private)/_data-access'

import { EvaluationResults } from './_components/EvaluationResults'
import { ManualEvaluationResultsClient } from './_components/ManualEvaluationResults'
import { fetchEvaluationCached } from './_lib/fetchEvaluationCached'

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

  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return (
      <ManualEvaluationResults
        commit={commit}
        evaluation={evaluation}
        params={await params}
        searchParams={await searchParams}
      />
    )
  }

  return (
    <LlmAsJudgeEvaluationResults
      commit={commit}
      evaluation={evaluation}
      params={await params}
      searchParams={await searchParams}
    />
  )
}

async function LlmAsJudgeEvaluationResults({
  params: { documentUuid },
  searchParams: { pageSize, page },
  evaluation,
  commit,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: QueryParams
  evaluation: EvaluationDto
  commit: Commit
}) {
  const rows = await computeEvaluationResultsWithMetadata({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid: documentUuid,
    draft: commit,
    page: page as string | undefined,
    pageSize: pageSize as string | undefined,
  })

  return <EvaluationResults evaluation={evaluation} evaluationResults={rows} />
}

async function ManualEvaluationResults({
  params,
  searchParams,
  evaluation,
  commit,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: QueryParams
  evaluation: EvaluationDto
  commit: Commit
}) {
  const rows = await fetchDocumentLogsWithEvaluationResults({
    evaluation,
    documentUuid: params.documentUuid!,
    commit,
    page: searchParams.page as string | undefined,
    pageSize: searchParams.pageSize as string | undefined,
  })

  return (
    <ManualEvaluationResultsClient
      evaluation={evaluation}
      documentLogs={rows}
    />
  )
}
