'use server'

import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  evaluationResultsV2SearchFromQueryParams,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { redirect } from 'next/navigation'
import { EvaluationPage as ClientEvaluationPage } from './_components/EvaluationPage'

export default async function EvaluationPage({
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
  const { projectId, commitUuid, documentUuid, evaluationUuid } = await params
  const search = evaluationResultsV2SearchFromQueryParams(await searchParams)

  const { workspace } = await getCurrentUser()
  const repository = new EvaluationResultsV2Repository(workspace.id)

  if (search.pagination.resultUuid) {
    const targetPage = await repository
      .findListByEvaluationPosition({
        evaluationUuid: evaluationUuid,
        params: search,
      })
      .then((r) => r.unwrap())

    if (targetPage && search.pagination.page !== targetPage) {
      const route = ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluationsV2.detail({ uuid: evaluationUuid }).root

      search.pagination.page = targetPage
      const queryParams = evaluationResultsV2SearchToQueryParams(search)

      return redirect(`${route}?${queryParams}`)
    }
  }

  const results = await repository
    .listByEvaluation({
      evaluationUuid: evaluationUuid,
      params: search,
    })
    .then((r) => r.unwrap())

  const selectedResult = results.find(
    (r) => r.uuid === search.pagination.resultUuid,
  )

  // TODO: Load evaluation stats
  const stats = {
    totalResults: 0,
    averageScore: 0,
    totalCost: 0,
    totalTokens: 0,
    dailyOverview: [],
    versionOverview: [],
  }

  return (
    <ClientEvaluationPage
      results={results}
      selectedResult={selectedResult}
      stats={stats}
      search={search}
    />
  )
}
