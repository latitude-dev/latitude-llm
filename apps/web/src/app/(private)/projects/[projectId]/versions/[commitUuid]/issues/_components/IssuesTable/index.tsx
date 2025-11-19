import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { SerializedIssue } from '$/stores/issues'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import {
  MINI_HISTOGRAM_STATS_DAYS,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
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
import { IssueItemActions } from '../IssueItemActions'
import { LastSeenCell } from '../LastSeenCell'

const FAKE_ROWS = Array.from({ length: 20 })
const DETAILS_OFFSET = { top: 12, bottom: 12 }

function IssuesTableLoader() {
  const headerCells = useMemo(() => Array.from({ length: 5 }), [])
  return (
    <>
      {FAKE_ROWS.map((_, index) => (
        <TableRow
          key={`skeleton-${index}`}
          className='border-b-[0.5px] h-12 max-h-12 border-border'
        >
          {headerCells.map((_, cellIndex) => (
            <TableCell
              fullWidth={index === 0}
              key={`skeleton-cell-${cellIndex}`}
            >
              <Skeleton height='h5' className='w-12' />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function IssuesTable({
  isLoading,
  issues,
  currentRoute,
  selectedIssue,
  onSelectChange,
  loadingMiniStats,
}: {
  serverParams: SafeIssuesParams
  isLoading: boolean
  issues: SerializedIssue[]
  currentRoute: string
  loadingMiniStats: boolean
  onSelectChange: (issue: SerializedIssue | undefined) => void
  selectedIssue?: SerializedIssue
}) {
  const {
    page,
    hasPrevPage,
    prevPage,
    hasNextPage,
    nextPage,
    totalCount,
    limit,
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
  const onCloseDetails = useCallback(() => {
    onSelectChange(undefined)
  }, [onSelectChange])

  // TODO(evaluation-generation): remove and use when we have the design for evaluations in the issues table
  // const { data: evaluations, isLoading: isLoadingEvaluations } =
  // useIssueEvaluations({
  //   projectId: project.id,
  //   commitUuid: commit.uuid,
  //   documentUuids: issues?.map((issue) => issue.documentUuid) ?? [],
  // })

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
              <TableHead>Issues</TableHead>
              <TableHead align='right'>Last occurrence</TableHead>
              <TableHead align='right'>Events</TableHead>
              <TableHead>
                <div className='w-full flex flex-row items-center justify-between gap-x-1'>
                  <span>Trend</span>
                  <Text.H6M>Latest {MINI_HISTOGRAM_STATS_DAYS} Days </Text.H6M>
                </div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <IssuesTableLoader />
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
                  <TableCell fullWidth>
                    <IssuesTitle issue={issue} />
                  </TableCell>
                  <TableCell align='right'>
                    <LastSeenCell issue={issue} />
                  </TableCell>
                  <TableCell align='right'>
                    <Text.H5>{issue.totalCount}</Text.H5>
                  </TableCell>
                  <TableCell className='min-w-72'>
                    <HistogramCell
                      issue={issue}
                      loadingMiniStats={isLoading || loadingMiniStats}
                    />
                  </TableCell>
                  <TableCell>
                    <IssueItemActions issue={issue} />
                  </TableCell>
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
              onCloseDetails={onCloseDetails}
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
