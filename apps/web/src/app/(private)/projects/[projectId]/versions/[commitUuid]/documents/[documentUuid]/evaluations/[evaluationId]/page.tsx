import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  computeEvaluationResultsWithMetadata,
  computeEvaluationResultsWithMetadataCount,
} from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
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
  const rows = await computeEvaluationResultsWithMetadata({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid: params.documentUuid,
    draft: commit,
    page: searchParams.page as string | undefined,
    pageSize: searchParams.pageSize as string | undefined,
  })
  const countResult = await computeEvaluationResultsWithMetadataCount({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid: params.documentUuid,
    draft: commit,
  })

  const pagination = buildPagination({
    baseUrl: pageUrl(params),
    count: countResult[0]?.count ?? 0,
    page: searchParams.page ? parseInt(searchParams.page as string) : 1,
    pageSize: searchParams.pageSize
      ? parseInt(searchParams.pageSize as string)
      : 25,
  })

  return (
    <EvaluationResults
      evaluation={evaluation}
      evaluationResults={rows}
      pagination={pagination}
    />
  )
}
