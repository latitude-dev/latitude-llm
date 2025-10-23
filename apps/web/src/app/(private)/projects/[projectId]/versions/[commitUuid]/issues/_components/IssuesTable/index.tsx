import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { SerializedIssue } from '$/stores/issues'
import { IssuesTitle } from '../IssuesTitle'
import { LastSeenCell } from '../LastSeenCell'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SafeIssuesParams } from '@latitude-data/constants/issues'
import { useMemo } from 'react'

const FAKE_ROWS = Array.from({ length: 20 })
function IssuesTableLoader({ showStatus }: { showStatus: boolean }) {
  const headerCells = useMemo(
    () => Array.from({ length: showStatus ? 4 : 3 }),
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
}: {
  serverParams: SafeIssuesParams
  isLoading: boolean
  issues: SerializedIssue[]
  currentRoute: string
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
  const noData = !isLoading && !issues.length
  const status = filters.status ?? serverParams.filters.status
  const showStatus = status !== 'active'

  if (noData) return <TableBlankSlate description='No issues in this project' />

  return (
    <Table
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
              className='border-b-[0.5px] h-12 max-h-12 border-border'
            >
              <TableCell>
                <IssuesTitle issue={issue} />
              </TableCell>
              <TableCell>
                <LastSeenCell issue={issue} />
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
  )
}
