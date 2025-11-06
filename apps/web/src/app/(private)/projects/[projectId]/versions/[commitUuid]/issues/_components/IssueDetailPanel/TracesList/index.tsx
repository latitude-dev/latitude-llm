import { useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useIssueSpans } from '$/stores/issues/spans'
import { IssueSpansTable } from '../../IssueSpansTable'
import { Span } from '@latitude-data/constants'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'

const PAGE_SIZE = 25

export function TracesList({
  issue,
  onView,
}: {
  issue: Issue
  onView: (span: Span) => () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [page, setPage] = useState(1)
  const {
    data: spans,
    hasNextPage,
    isLoading,
  } = useIssueSpans({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: issue.id,
    page,
    pageSize: PAGE_SIZE,
  })
  return (
    <>
      <Text.H5M>Logs</Text.H5M>
      {isLoading ? (
        <TableSkeleton rows={8} cols={3} maxHeight={320} />
      ) : spans.length > 0 ? (
        <IssueSpansTable
          spans={spans}
          showPagination
          onView={onView}
          PaginationFooter={
            <LimitedTablePaginationFooter
              page={page}
              nextPage={hasNextPage}
              onPageChange={setPage}
            />
          }
        />
      ) : (
        <BlankSlate>No logs found for this issue.</BlankSlate>
      )}
    </>
  )
}
