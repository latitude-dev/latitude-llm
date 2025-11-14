'use server'

import {
  getDocumentLogsApproximatedCountByProjectCached,
  listActiveRunsCached,
  listCompletedRunsCached,
} from '$/app/(private)/_data-access'
import {
  LIMITED_VIEW_THRESHOLD,
  RunSourceGroup,
} from '@latitude-data/core/constants'
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
  const {
    activePage,
    activePageSize,
    sourceGroup,
    completedPage,
    completedPageSize,
  } = await searchParams

  const defaultSourceGroup = RunSourceGroup.Production

  const projectId = Number(_projectId)
  const activeSearch = {
    page: activePage ? Number(activePage) : undefined,
    pageSize: activePageSize ? Number(activePageSize) : undefined,
    sourceGroup: (sourceGroup as RunSourceGroup) ?? defaultSourceGroup,
  }
  const completedSearch = {
    page: completedPage ? Number(completedPage) : undefined,
    pageSize: completedPageSize ? Number(completedPageSize) : undefined,
    sourceGroup: (sourceGroup as RunSourceGroup) ?? defaultSourceGroup,
  }

  const activeRuns = await listActiveRunsCached({ projectId, ...activeSearch }) // prettier-ignore
  const completedRuns = await listCompletedRunsCached({ projectId, ...completedSearch }) // prettier-ignore

  let limitedView = undefined
  const approximatedCount = await getDocumentLogsApproximatedCountByProjectCached(projectId) // prettier-ignore
  if (approximatedCount > LIMITED_VIEW_THRESHOLD) {
    limitedView = { totalRuns: approximatedCount }
  }

  return (
    <ClientRunsPage
      active={{ runs: activeRuns, search: activeSearch }}
      completed={{ runs: completedRuns.items }}
      limitedView={limitedView}
      defaultSourceGroup={(sourceGroup as RunSourceGroup) ?? defaultSourceGroup}
    />
  )
}
