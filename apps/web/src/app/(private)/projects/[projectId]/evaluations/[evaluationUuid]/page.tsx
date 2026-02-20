'use server'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { resolveCommitFilterFromUrl } from '$/lib/resolveCommitFilterFromUrl'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '@latitude-data/core/repositories'
import { cloneDeep } from 'lodash-es'
import { notFound, redirect } from 'next/navigation'
import { EvaluationPage as ClientEvaluationPage } from '../../versions/[commitUuid]/documents/[documentUuid]/(withTabs)/evaluations/[evaluationUuid]/_components/EvaluationPage'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import {
  EvaluationResultsV2Search,
  evaluationResultsV2SearchFromQueryParams,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/helpers'

const DEFAULT_SEARCH: EvaluationResultsV2Search = {
  filters: {},
  orders: {
    recency: 'desc',
  },
  pagination: {
    page: 1,
    pageSize: DEFAULT_PAGINATION_SIZE,
  },
}

export default async function ProjectEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    evaluationUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId, evaluationUuid } = await params
  let search = evaluationResultsV2SearchFromQueryParams(await searchParams)
  search = {
    filters: { ...cloneDeep(DEFAULT_SEARCH.filters), ...search.filters },
    orders: { ...cloneDeep(DEFAULT_SEARCH.orders), ...search.orders },
    pagination: {
      ...cloneDeep(DEFAULT_SEARCH.pagination),
      ...search.pagination,
    },
  }

  const { workspace } = await getCurrentUserOrRedirect()

  const commitsRepository = new CommitsRepository(workspace.id)
  const commits = await commitsRepository
    .filterByProject(Number(projectId))
    .then((r) => r.unwrap())
  const commit = commits[0]
  if (!commit) return notFound()

  const resolvedSearch = await resolveCommitFilterFromUrl({
    commitsRepository,
    commit,
    search,
  })

  const repository = new EvaluationResultsV2Repository(workspace.id)

  if (resolvedSearch.pagination.resultUuid) {
    const targetPage = await repository
      .findListByEvaluationPosition({
        evaluationUuid: evaluationUuid,
        params: resolvedSearch,
      })
      .then((r) => r.unwrap())

    if (targetPage && resolvedSearch.pagination.page !== targetPage) {
      const route = ROUTES.projects
        .detail({ id: Number(projectId) })
        .evaluations.detail({ uuid: evaluationUuid }).root

      resolvedSearch.pagination.page = targetPage
      const queryParams = evaluationResultsV2SearchToQueryParams(resolvedSearch)

      return redirect(`${route}?${queryParams}`)
    }
  }

  const results = await repository
    .listByEvaluation({
      evaluationUuid: evaluationUuid,
      params: resolvedSearch,
    })
    .then((r) => r.unwrap())

  const selectedResult = results.find(
    (r) => r.uuid === resolvedSearch.pagination.resultUuid,
  )

  return (
    <ClientEvaluationPage
      results={results}
      search={resolvedSearch}
      selectedResult={selectedResult}
    />
  )
}
