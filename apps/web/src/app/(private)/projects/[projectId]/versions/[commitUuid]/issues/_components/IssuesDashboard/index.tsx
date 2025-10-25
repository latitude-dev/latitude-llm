'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useIssues } from '$/stores/issues'
import { SafeIssuesParams } from '@latitude-data/constants/issues'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { IssuesFilters } from '../IssuesFilters'
import { IssuesTable } from '../IssuesTable'

export function IssuesDashboard({
  issues: serverIssues,
  filters,
  sorting,
  cursor: initialCursor,
  limit: initialLimit,
}: {
  issues: Issue[]
  filters: SafeIssuesParams['filters']
  sorting: SafeIssuesParams['sorting']
  cursor: string | undefined
  limit: number
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const {
    data: issues,
    hasMore,
    nextCursor,
    isLoading,
  } = useIssues(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      params: {
        filters,
        cursor: initialCursor,
        limit: initialLimit,
      },
    },
    {
      fallbackData: serverIssues,
    },
  )

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title={<Text.H4B color='foreground'>Issues</Text.H4B>}
        actions={<IssuesFilters />}
        table={
          <IssuesTable
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
