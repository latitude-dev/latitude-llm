'use client'

import { useDebounce } from 'use-debounce'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useIssues } from '$/stores/issues'
import { SafeIssuesParams, IssueSort } from '@latitude-data/constants/issues'
import { Issues } from './Issues'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { IssuesFilters } from './Filters'

type IssueFilters = SafeIssuesParams['filters']

export function IssuesPage({
  filterOptions: initialFilterOptions,
  sort: initialSort,
  sortDirection: initialSortDirection,
  cursor: initialCursor,
  limit: initialLimit,
}: {
  filterOptions: IssueFilters
  sort: IssueSort
  sortDirection: 'asc' | 'desc'
  cursor?: string
  limit: number
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [debouncedFilterOptions] = useDebounce(initialFilterOptions, 500)
  const {
    data: issues,
    hasMore,
    nextCursor,
    isLoading,
  } = useIssues({
    projectId: project.id,
    commitUuid: commit.uuid,
    params: {
      filters: debouncedFilterOptions,
      sort: initialSort,
      sortDirection: initialSortDirection,
      cursor: initialCursor,
      limit: initialLimit,
    },
  })

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title={<Text.H4B color='foreground'>Issues</Text.H4B>}
        actions={
          <IssuesFilters />
        }
        table={
          <Issues
            issues={issues}
            hasMore={hasMore}
            nextCursor={nextCursor}
            isLoading={isLoading}
            projectId={project.id}
            commitUuid={commit.uuid}
          />
        }
      />
    </div>
  )
}
