'use server'

import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  DEFAULT_PAGINATION_SIZE,
  EvaluationResultsV2Search,
  evaluationResultsV2SearchFromQueryParams,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { env } from '@latitude-data/env'
import { cloneDeep } from 'lodash-es'
import { redirect } from 'next/navigation'
import { EvaluationPage as ClientEvaluationPage } from './_components/EvaluationPage'

const DEFAULT_SEARCH: EvaluationResultsV2Search = {
  filters: {
    experimentIds: [], // Note: don't show experiment results by default
  },
  orders: {
    recency: 'desc',
  },
  pagination: {
    page: 1,
    pageSize: DEFAULT_PAGINATION_SIZE,
  },
}

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
  let search = evaluationResultsV2SearchFromQueryParams(await searchParams)
  search = {
    filters: { ...cloneDeep(DEFAULT_SEARCH.filters), ...search.filters },
    orders: { ...cloneDeep(DEFAULT_SEARCH.orders), ...search.orders },
    pagination: {
      ...cloneDeep(DEFAULT_SEARCH.pagination),
      ...search.pagination,
    },
  }

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

  // Note: stats are lazily loaded in the client

  return (
    <ClientEvaluationPage
      results={results}
      selectedResult={selectedResult}
      search={search}
      refinementEnabled={env.LATITUDE_CLOUD}
    />
  )
}
