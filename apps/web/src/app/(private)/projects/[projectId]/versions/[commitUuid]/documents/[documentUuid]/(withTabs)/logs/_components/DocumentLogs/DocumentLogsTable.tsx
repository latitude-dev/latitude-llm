'use client'

import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { KeysetTablePaginationFooter } from '$/components/TablePaginationFooter/KeysetTablePaginationFooter'
import { OnSelectedSpanFn } from '$/components/tracing/traces/Timeline'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { relativeTime } from '$/lib/relativeTime'
import {
  DocumentLogWithMetadataAndError,
  EvaluationResultV2,
  EvaluationV2,
  LOG_FILTERS_ENCODED_PARAMS,
} from '@latitude-data/core/constants'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import {
  buildPagination,
  IPagination,
} from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogsLimitedView } from '@latitude-data/core/schema/models/types/DocumentLog'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
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
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { capitalize } from 'lodash-es'
import { forwardRef, Fragment, useMemo } from 'react'
import { DocumentLogTraces } from './DocumentLogInfo/Traces'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'

type DocumentLogRow = DocumentLogWithMetadataAndError & {
  realtimeAdded?: boolean
}

function EvaluationsColumn({
  documentLog,
  evaluationResults = [],
  evaluations,
  color: cellColor,
  isLoading,
}: {
  documentLog: DocumentLogRow
  evaluationResults?: EvaluationResultV2[]
  evaluations: EvaluationV2[]
  color: TextColor
  isLoading: boolean
}) {
  const passedResults = useMemo(
    () => evaluationResults.filter((result) => !!result.hasPassed).length,
    [evaluationResults],
  )

  const pendingResults = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          getEvaluationMetricSpecification(e).supportsManualEvaluation &&
          !evaluationResults.find((r) => r.evaluationUuid === e.uuid),
      ).length,
    [evaluationResults, evaluations],
  )

  if (documentLog.error?.code) {
    return <Text.H5 color={cellColor}>-</Text.H5>
  }

  if (isLoading) {
    return <Skeleton className='w-full h-4' />
  }

  if (!evaluationResults.length && !pendingResults) {
    return <Text.H5 color={cellColor}>-</Text.H5>
  }

  return (
    <div className='flex justify-center items-center gap-2 shrink-0'>
      {evaluationResults.length > 0 && (
        <Badge
          variant={
            passedResults >= evaluationResults.length * 0.25
              ? passedResults >= evaluationResults.length * 0.75
                ? 'successMuted'
                : 'warningMuted'
              : 'destructiveMuted'
          }
        >
          {passedResults}/{evaluationResults.length} passed
        </Badge>
      )}
      {pendingResults > 0 && (
        <Badge variant='muted'>{pendingResults} pending</Badge>
      )}
    </div>
  )
}

const countLabel = (selected: number) => (count: number) => {
  return selected ? `${selected} of ${count} logs selected` : `${count} logs`
}

type Props = {
  documentLogs: DocumentLogRow[]
  pagination?: IPagination
  selectedLog: DocumentLogWithMetadataAndError | undefined
  setSelectedLog: (log: DocumentLogWithMetadataAndError | undefined) => void
  selectableState: SelectableRowsHook
  limitedView?: DocumentLogsLimitedView
  limitedCursor?: string | null
  setLimitedCursor?: (cursor: string | null) => void
  onSelectedSpan: OnSelectedSpanFn
}
export const DocumentLogsTable = forwardRef<HTMLTableElement, Props>(
  function DocumentLogsTable(
    {
      documentLogs,
      pagination,
      selectedLog,
      setSelectedLog,
      selectableState: {
        headerState,
        selectedCount,
        isSelected,
        toggleRow,
        toggleAll,
      },
      limitedView,
      limitedCursor,
      setLimitedCursor,
      onSelectedSpan,
    },
    ref,
  ) {
    const { project } = useCurrentProject()
    const { commit } = useCurrentCommit()
    const { document } = useCurrentDocument()
    const { data: evaluationResults, isLoading } =
      useEvaluationResultsV2ByDocumentLogs({
        project,
        commit,
        document,
        documentLogUuids: documentLogs.map((d) => d.uuid),
      })
    const { data: evaluations } = useEvaluationsV2({
      project,
      commit,
      document,
    })
    const queryParams = typeof window !== 'undefined' ? window.location.search : undefined // prettier-ignore
    const queryParamsObject = useMemo<QueryParams | undefined>(() => {
      if (queryParams === undefined) return undefined

      const searchParams = new URLSearchParams(queryParams)
      // NOTE: Remove logUuid from pagination. Otherwhise never moves from
      // selected log (`logUuid` is always present in the URL)
      searchParams.delete('logUuid')
      return Object.fromEntries(searchParams)
    }, [queryParams])

    return (
      <Table
        ref={ref}
        className='table-auto'
        externalFooter={
          limitedView ? (
            <KeysetTablePaginationFooter
              count={limitedView.totalCount}
              countLabel={countLabel(selectedCount)}
              cursor={limitedCursor ?? null}
              setNext={setLimitedCursor!}
              setPrev={setLimitedCursor!}
              unknown={queryParams?.includes('logUuid')}
            />
          ) : (
            !!pagination && (
              <LinkableTablePaginationFooter
                pagination={buildPagination({
                  baseUrl: pagination.baseUrl ?? '',
                  count: pagination.count ?? 0,
                  queryParams: queryParamsObject,
                  encodeQueryParams: false,
                  paramsToEncode: LOG_FILTERS_ENCODED_PARAMS,
                  page: Number(pagination.page),
                  pageSize: Number(pagination.pageSize),
                })}
                countLabel={countLabel(selectedCount)}
              />
            )
          )
        }
      >
        <TableHeader className='sticky top-0 z-10'>
          <TableRow>
            <TableHead>
              <Checkbox checked={headerState} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Evaluations</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead>Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentLogs.map((documentLog) => {
            const error = getRunErrorFromErrorable(documentLog.error)
            const cellColor = error
              ? 'destructiveMutedForeground'
              : 'foreground'
            return (
              <Fragment key={documentLog.uuid}>
                <TableRow
                  onClick={() =>
                    setSelectedLog(
                      selectedLog?.uuid === documentLog.uuid
                        ? undefined
                        : documentLog,
                    )
                  }
                  className={cn(
                    'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                    {
                      'bg-secondary': selectedLog?.uuid === documentLog.uuid,
                      'animate-flash': documentLog.realtimeAdded,
                    },
                  )}
                >
                  <TableCell
                    preventDefault
                    align='left'
                    onClick={() => {
                      if (error) return
                      toggleRow(documentLog.id, !isSelected(documentLog.id))
                    }}
                    className={cn({
                      'pointer-events-none cursor-wait': !!error,
                    })}
                  >
                    <Checkbox
                      fullWidth={false}
                      disabled={!!error}
                      checked={error ? false : isSelected(documentLog.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap color={cellColor}>
                      {relativeTime(documentLog.createdAt)}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <span className='flex flex-row gap-2 items-center truncate'>
                      <Badge
                        variant={
                          documentLog.commit.version ? 'accent' : 'muted'
                        }
                        className='flex-shrink-0'
                      >
                        <Text.H6 noWrap>
                          {documentLog.commit.version
                            ? `v${documentLog.commit.version}`
                            : 'Draft'}
                        </Text.H6>
                      </Badge>
                      <Text.H5 color={cellColor} noWrap ellipsis>
                        {documentLog.commit.title}
                      </Text.H5>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Text.H5 color={cellColor}>
                      {capitalize(documentLog.source || '-')}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <EvaluationsColumn
                      color={cellColor}
                      documentLog={documentLog}
                      evaluations={evaluations}
                      isLoading={isLoading}
                      evaluationResults={evaluationResults[documentLog.uuid]}
                    />
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap color={cellColor}>
                      {formatDuration(documentLog.duration)}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap color={cellColor}>
                      {typeof documentLog.tokens === 'number'
                        ? documentLog.tokens
                        : '-'}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap color={cellColor}>
                      {typeof documentLog.costInMillicents === 'number'
                        ? formatCostInMillicents(documentLog.costInMillicents)
                        : '-'}
                    </Text.H5>
                  </TableCell>
                </TableRow>
                {selectedLog?.uuid === documentLog.uuid && (
                  <TableRow hoverable={false}>
                    <TableCell
                      colSpan={999}
                      className='max-w-full w-full h-full !p-0'
                      innerClassName='w-full h-full flex !justify-center !items-center'
                    >
                      <DocumentLogTraces
                        documentLog={documentLog}
                        onSelectedSpan={onSelectedSpan}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    )
  },
)
