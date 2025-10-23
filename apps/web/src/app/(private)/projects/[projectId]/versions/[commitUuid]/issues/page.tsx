import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { issuesFiltersQueryParamsParser } from '@latitude-data/core/data-access/issues/parseFilters'
import { IssuesPage } from './_components'

export default async function IssuesPageRoute({
  params: _p,
  searchParams,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  searchParams: Promise<QueryParams>
}) {
  const parsed = issuesFiltersQueryParamsParser.parse(searchParams)
  return (
    <IssuesPage
      filterOptions={parsed.filters}
      sort={parsed.sort}
      sortDirection={parsed.sortDirection}
      cursor={parsed.cursor}
      limit={parsed.limit}
    />
  )
}
