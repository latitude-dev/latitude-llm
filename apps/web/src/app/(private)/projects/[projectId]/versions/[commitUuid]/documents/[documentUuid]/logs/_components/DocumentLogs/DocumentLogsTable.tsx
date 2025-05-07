'use client'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { normalizeNumber } from '$/lib/normalizeNumber'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import {
  DocumentLogFilterOptions,
  EvaluationConfigurationNumerical,
  EvaluationResultableType,
  EvaluationV2,
  LOG_FILTERS_ENCODED_PARAMS,
  ResultWithEvaluationTmp,
} from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
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
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { capitalize } from 'lodash-es'
import { useSearchParams } from 'next/navigation'
import { forwardRef, useMemo } from 'react'

const countLabel = (selected: number) => (count: number) => {
  return selected ? `${selected} of ${count} logs selected` : `${count} logs`
}

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
  evaluationResults?: ResultWithEvaluationTmp[]
  evaluations: EvaluationV2[]
  color: TextColor
  isLoading: boolean
}) {
  const passedResults = useMemo(
    () =>
      evaluationResults.filter(({ evaluation, result, version }) => {
        if (version === 'v2') return !!result.hasPassed

        const value = result.result
        if (value === undefined) return false

        if (result.resultableType === EvaluationResultableType.Boolean) {
          return typeof value === 'string' ? value === 'true' : Boolean(value)
        }

        if (result.resultableType === EvaluationResultableType.Number) {
          const minValue = (
            evaluation.resultConfiguration as EvaluationConfigurationNumerical
          )?.minValue
          const maxValue = (
            evaluation.resultConfiguration as EvaluationConfigurationNumerical
          )?.maxValue
          return normalizeNumber(Number(value), minValue, maxValue) >= 0.75
        }

        return true
      }).length,
    [evaluationResults],
  )

  const pendingResults = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          getEvaluationMetricSpecification(e).supportsManualEvaluation &&
          !evaluationResults.find((r) => r.evaluation.uuid === e.uuid),
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

type Props = {
  documentLogs: DocumentLogRow[]
  documentLogFilterOptions: DocumentLogFilterOptions
  evaluationResults: Record<string, ResultWithEvaluationTmp[]>
  evaluations: EvaluationV2[]
  selectedLog: DocumentLogWithMetadataAndError | undefined
  setSelectedLog: (log: DocumentLogWithMetadataAndError | undefined) => void
  isLoading: boolean
  selectableState: SelectableRowsHook
}
export const DocumentLogsTable = forwardRef<HTMLTableElement, Props>(
  function DocumentLogsTable(
    {
      documentLogs,
      documentLogFilterOptions,
      evaluationResults,
      evaluations,
      selectedLog,
      setSelectedLog,
      isLoading,
      selectableState: {
        headerState,
        isSelected,
        toggleRow,
        toggleAll,
        selectedCount,
      },
    },
    ref,
  ) {
    const searchParams = useSearchParams()
    const page = searchParams.get('page') ?? '1'
    const pageSize = searchParams.get('pageSize') ?? '25'
    const { commit } = useCurrentCommit()
    const { project } = useCurrentProject()
    const { document } = useCurrentDocument()
    const { data: pagination, isLoading: isPaginationLoading } =
      useDocumentLogsPagination({
        projectId: project.id,
        filterOptions: documentLogFilterOptions,
        documentUuid: document.documentUuid,
        page,
        pageSize,
      })
    const queryParams =
      typeof window !== 'undefined' ? window.location.search : ''

    return (
      <Table
        ref={ref}
        className='table-auto'
        externalFooter={
          <LinkableTablePaginationFooter
            countLabel={countLabel(selectedCount)}
            isLoading={isPaginationLoading}
            pagination={
              pagination
                ? buildPagination({
                    baseUrl: ROUTES.projects
                      .detail({ id: project.id })
                      .commits.detail({ uuid: commit.uuid })
                      .documents.detail({ uuid: document.documentUuid }).logs
                      .root,
                    count: pagination.count,
                    queryParams,
                    encodeQueryParams: false,
                    paramsToEncode: LOG_FILTERS_ENCODED_PARAMS,
                    page: Number(page),
                    pageSize: Number(pageSize),
                  })
                : undefined
            }
          />
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
              <TableRow
                key={documentLog.uuid}
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
                  onClick={() =>
                    toggleRow(documentLog.id, !isSelected(documentLog.id))
                  }
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
                  <div className='flex flex-row gap-2 items-center min-w-0 max-w-xs'>
                    <Badge
                      variant={documentLog.commit.version ? 'accent' : 'muted'}
                      shape='square'
                    >
                      <Text.H6 noWrap>
                        {documentLog.commit.version
                          ? `v${documentLog.commit.version}`
                          : 'Draft'}
                      </Text.H6>
                    </Badge>
                    <Text.H5 noWrap ellipsis color={cellColor}>
                      {documentLog.commit.title}
                    </Text.H5>
                  </div>
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
                    evaluationResults={evaluationResults[documentLog.uuid]}
                    evaluations={evaluations}
                    isLoading={isLoading}
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
            )
          })}
        </TableBody>
      </Table>
    )
  },
)
