import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useIssueSpans } from '$/stores/issues/spans'
import { Span } from '@latitude-data/constants'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { IssueSpansTable } from '../../IssueSpansTable'

export function TracesList({
  issue,
  onView,
}: {
  issue: Issue
  onView: (span: Span) => () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const {
    data: spans,
    hasNext,
    hasPrev,
    isLoading,
    goToNextPage,
    goToPrevPage,
  } = useIssueSpans({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId: issue.id,
  })
  return (
    <>
      <Text.H5M>Traces</Text.H5M>
      {isLoading ? (
        <TableSkeleton rows={8} cols={3} maxHeight={320} />
      ) : spans.length > 0 ? (
        <IssueSpansTable
          spans={spans}
          showPagination
          onView={onView}
          PaginationFooter={
            <SimpleKeysetTablePaginationFooter
              hasNext={hasNext}
              hasPrev={hasPrev}
              setNext={goToNextPage}
              setPrev={goToPrevPage}
              isLoading={isLoading}
            />
          }
        />
      ) : (
        <BlankSlate>No logs found for this issue.</BlankSlate>
      )}
    </>
  )
}
