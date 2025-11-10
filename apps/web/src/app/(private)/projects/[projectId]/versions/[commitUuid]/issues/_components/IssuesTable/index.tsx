import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { SerializedIssue } from '$/stores/issues'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { SafeIssuesParams } from '@latitude-data/constants/issues'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo, useRef } from 'react'
import { HistogramCell } from '../HistogramCell'
import { IssuesDetailPanel } from '../IssueDetailPanel'
import { IssuesTitle } from '../IssuesTitle'
import { LastSeenCell } from '../LastSeenCell'

const FAKE_ROWS = Array.from({ length: 20 })
const DETAILS_OFFSET = { top: 12, bottom: 12 }

function IssuesTableLoader({ showStatus }: { showStatus: boolean }) {
  const headerCells = useMemo(
    () => Array.from({ length: showStatus ? 5 : 4 }),
    [showStatus],
  )
  return (
    <>
      {FAKE_ROWS.map((_, index) => (
        <TableRow
          key={`skeleton-${index}`}
          className='border-b-[0.5px] h-12 max-h-12 border-border'
        >
          {headerCells.map((_, cellIndex) => (
            <TableCell key={`skeleton-cell-${cellIndex}`}>
              <Skeleton height='h5' className='w-12' />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

function StatusCell({ issue }: { issue: SerializedIssue }) {
  const status = issue.isResolved
    ? 'Resolved'
    : issue.isIgnored
      ? 'Ignored'
      : 'Active'
  return <Text.H5 color='foregroundMuted'>{status}</Text.H5>
}

export function IssuesTable({
  serverParams,
  isLoading,
  issues,
  currentRoute,
  loadingMiniStats,
  selectedIssue,
  onSelectChange,
}: {
  serverParams: SafeIssuesParams
  isLoading: boolean
  issues: SerializedIssue[]
  currentRoute: string
  loadingMiniStats: boolean
  onSelectChange: (issue: Issue | undefined) => void
  selectedIssue?: Issue
}) {
  const {
    page,
    hasPrevPage,
    prevPage,
    hasNextPage,
    nextPage,
    totalCount,
    limit,
    filters,
  } = useIssuesParameters((state) => ({
    init: state.init,
    page: state.page,
    urlParameters: state.urlParameters,
    prevPage: state.prevPage,
    hasPrevPage: state.hasPrevPage,
    nextPage: state.nextPage,
    hasNextPage: state.hasNextPage,
    totalCount: state.totalCount,
    limit: state.limit,
    filters: state.filters,
  }))
  const stickyRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const noData = !isLoading && !issues.length
  const status = filters.status ?? serverParams.filters.status
  const onClickRow = useCallback(
    (issue: SerializedIssue) => () => {
      onSelectChange(
        selectedIssue === undefined
          ? issue
          : selectedIssue.id === issue.id
            ? undefined
            : issue,
      )
    },
    [onSelectChange, selectedIssue],
  )
  const showStatus = status !== 'active'

  if (noData) {
    return (
      <TableBlankSlate description='No issues discovered in this project yet' />
    )
  }

  return (
    <TableResizableLayout
      rightPaneRef={sidebarWrapperRef}
      showRightPane={!!selectedIssue}
      leftPane={
        <Table
          ref={stickyRef}
          externalFooter={
            <LinkableTablePaginationFooter
              countLabel={(count) => `${count} issues`}
              onPrev={prevPage}
              prevPageDisabled={!hasPrevPage}
              nextPageDisabled={!hasNextPage}
              onNext={nextPage}
              pagination={buildPagination({
                count: totalCount,
                baseUrl: currentRoute,
                page: Number(page),
                pageSize: limit,
              })}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Seen at</TableHead>
              <TableHead>14d</TableHead>
              <TableHead>Events</TableHead>
              {showStatus ? <TableHead>Status</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <IssuesTableLoader showStatus={showStatus} />
            ) : (
              issues.map((issue) => (
                <TableRow
                  key={issue.id}
                  onClick={onClickRow(issue)}
                  className={cn(
                    'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                    {
                      'bg-secondary': selectedIssue?.id === issue.id,
                    },
                  )}
                >
                  <TableCell>
                    <IssuesTitle issue={issue} />
                  </TableCell>
                  <TableCell>
                    <LastSeenCell issue={issue} />
                  </TableCell>
                  <TableCell>
                    <HistogramCell
                      issueId={issue.id}
                      loadingBatch={loadingMiniStats}
                    />
                  </TableCell>
                  <TableCell>{issue.totalCount}</TableCell>
                  {showStatus ? (
                    <TableCell>
                      <StatusCell issue={issue} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      }
      rightPane={
        selectedIssue ? (
          <div ref={sidebarWrapperRef} className='h-full'>
            <IssuesDetailPanel
              stickyRef={stickyRef}
              issue={selectedIssue}
              containerRef={sidebarWrapperRef}
              offset={DETAILS_OFFSET}
            />
          </div>
        ) : null
      }
    />
  )
}
