'use server'

import {
  listActiveRunsCached,
  listCompletedRunsCached,
} from '$/app/(private)/_data-access'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { RunsPage as ClientRunsPage } from './_components/RunsPage'

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId: _projectId } = await params
  const { activePage, activePageSize, completedPage, completedPageSize } =
    await searchParams

  const projectId = Number(_projectId)
  const activeSearch = {
    page: activePage ? Number(activePage) : undefined,
    pageSize: activePageSize ? Number(activePageSize) : undefined,
  }
  const completedSearch = {
    page: completedPage ? Number(completedPage) : undefined,
    pageSize: completedPageSize ? Number(completedPageSize) : undefined,
  }

  const activeRuns = await listActiveRunsCached({ projectId, ...activeSearch}) // prettier-ignore
  const completedRuns = await listCompletedRunsCached({ projectId, ...completedSearch}) // prettier-ignore

  return (
    <ClientRunsPage
      active={{ runs: activeRuns, search: activeSearch }}
      completed={{ runs: completedRuns, search: completedSearch }}
    />
  )
}
