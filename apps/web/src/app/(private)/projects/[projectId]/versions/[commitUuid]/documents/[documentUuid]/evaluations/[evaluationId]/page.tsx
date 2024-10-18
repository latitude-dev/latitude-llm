import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { findCommitCached } from '$/app/(private)/_data-access'

import { EvaluationResults } from './_components/EvaluationResults'
import { fetchEvaluationCached } from './_lib/fetchEvaluationCached'

export default async function ConnectedEvaluationPage({
  params,
  searchParams,
}: {
  params: {
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationId: string
  }
  searchParams: QueryParams
}) {
  const evaluation = await fetchEvaluationCached(Number(params.evaluationId))
  const commit = await findCommitCached({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })
  const rows = await computeEvaluationResultsWithMetadata({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid: params.documentUuid,
    draft: commit,
    page: searchParams.page as string | undefined,
    pageSize: searchParams.pageSize as string | undefined,
  })

  return <EvaluationResults evaluation={evaluation} evaluationResults={rows} />
}
