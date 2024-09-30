import { paginateQuery } from '@latitude-data/core/lib/index'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeEvaluationResultsWithMetadataQuery } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { findCommitCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'

import { EvaluationResults } from './_components/EvaluationResults'
import { fetchEvaluationCached } from './_lib/fetchEvaluationCached'

function pageUrl(params: {
  projectId: string
  commitUuid: string
  documentUuid: string
  evaluationId: string
}) {
  return ROUTES.projects
    .detail({ id: Number(params.projectId) })
    .commits.detail({ uuid: params.commitUuid })
    .documents.detail({ uuid: params.documentUuid })
    .evaluations.detail(Number(params.evaluationId)).root
}

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
  const { rows, pagination } = await paginateQuery({
    searchParams,
    pageUrl: { base: pageUrl(params) },
    dynamicQuery: computeEvaluationResultsWithMetadataQuery({
      workspaceId: evaluation.workspaceId,
      evaluation,
      documentUuid: params.documentUuid,
      draft: commit,
    }).$dynamic(),
  })
  return (
    <EvaluationResults
      evaluation={evaluation}
      evaluationResults={rows}
      pagination={pagination}
    />
  )
}
