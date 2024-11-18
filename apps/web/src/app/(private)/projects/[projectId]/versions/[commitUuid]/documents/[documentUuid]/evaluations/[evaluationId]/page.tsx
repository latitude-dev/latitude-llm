import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { findCommitCached } from '$/app/(private)/_data-access'

import { EvaluationResults } from './_components/EvaluationResults'
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
  const { projectId, commitUuid, documentUuid, evaluationId } = await params
  const { pageSize, page } = await searchParams
  const evaluation = await fetchEvaluationCached(Number(evaluationId))
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })
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
