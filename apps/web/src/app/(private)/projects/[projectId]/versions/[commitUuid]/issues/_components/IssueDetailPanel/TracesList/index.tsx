import { useCallback, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { cn } from '@latitude-data/web-ui/utils'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useIssueSpans } from '$/stores/issues/spans'
import { IssueSpansTable } from '../../IssueSpansTable'
import { Span } from '@latitude-data/constants'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'

const PAGE_SIZE = 25

export function TracesList({ issue }: { issue: Issue }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [page, setPage] = useState(1)
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null)
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
  const onView = useCallback(
    (span: Span) => () => {
      setSelectedSpan(span)
    },
    [],
  )
  const showDetails = selectedSpan !== null
  return (
    <div className='relative w-full overflow-hidden'>
      {/* === SLIDING CONTENT WRAPPER === */}
      <div
        className={cn(
          'grid grid-cols-2 w-[200%]',
          'transition-transform duration-300',
          {
            '-translate-x-1/2': showDetails,
          },
        )}
      >
        {/* === TABLE SCREEN === */}
        <div
          className={cn(
            'relative w-full transition-opacity duration-300',
            'flex flex-col gap-y-4',
            {
              'opacity-0': showDetails,
              'opacity-100': !showDetails,
            },
          )}
        >
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
          ) : null}
        </div>

        {/* === DETAILS SCREEN === */}
        <div
          className={cn(
            'relative w-full transition-opacity duration-300',
            'flex flex-col gap-y-4',
            {
              'opacity-0': !showDetails,
              'opacity-100': showDetails,
            },
          )}
        >
          <div>
            <Button
              variant='ghost'
              size='none'
              iconProps={{ name: 'chevronLeft' }}
              onClick={() => setSelectedSpan(null)}
            >
              Back to list
            </Button>
          </div>
          {selectedSpan ? (
            <TraceInfoPanel
              insideOtherPanel
              spanId={selectedSpan.id}
              traceId={selectedSpan.traceId}
              documentUuid={issue.documentUuid}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
