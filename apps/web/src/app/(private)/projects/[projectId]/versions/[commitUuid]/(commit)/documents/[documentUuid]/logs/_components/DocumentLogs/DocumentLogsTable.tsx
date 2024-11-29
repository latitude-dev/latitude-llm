import { forwardRef } from 'react'
import { capitalize } from 'lodash-es'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  DocumentLogWithMetadataAndError,
  ResultWithEvaluation,
} from '@latitude-data/core/repositories'
import {
  Badge,
  Checkbox,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  TextColor,
  Tooltip,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import { useSearchParams } from 'next/navigation'

import { ResultCellContent } from '../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'

const countLabel = (selected: number) => (count: number) => {
  return selected ? `${selected} of ${count} logs selected` : `${count} logs`
}

type DocumentLogRow = DocumentLogWithMetadataAndError & {
  realtimeAdded?: boolean
}

function EvaluationResultItem({ result, evaluation }: ResultWithEvaluation) {
  if (result.resultableType === EvaluationResultableType.Text) {
    return <Badge variant='outline'>text</Badge>
  }

  return <ResultCellContent evaluation={evaluation} value={result.result} />
}

function EvaluationsColumn({
  evaluationResults = [],
  color: cellColor,
  isLoading,
}: {
  evaluationResults?: ResultWithEvaluation[]
  color: TextColor
  isLoading: boolean
}) {
  if (isLoading) {
    return <Skeleton className='w-full h-4' />
  }

  if (!evaluationResults.length) {
    return <Text.H5 color={cellColor}>-</Text.H5>
  }

  const resultsToDisplay = evaluationResults.slice(0, 2)
  const extraResults = evaluationResults.length - resultsToDisplay.length

  return (
    <div className='flex flex-row gap-2 flex-shrink-0'>
      {resultsToDisplay.map(({ result, evaluation }) => (
        <Tooltip
          key={result.uuid}
          trigger={
            <EvaluationResultItem result={result} evaluation={evaluation} />
          }
        >
          {evaluation.name}
        </Tooltip>
      ))}
      {extraResults > 0 && (
        <Tooltip trigger={<Badge variant='outline'>+{extraResults}</Badge>}>
          {extraResults} more evaluations
        </Tooltip>
      )}
    </div>
  )
}

type Props = {
  documentLogs: DocumentLogRow[]
  evaluationResults: Record<number, ResultWithEvaluation[]>
  selectedLog: DocumentLogWithMetadataAndError | undefined
  setSelectedLog: (log: DocumentLogWithMetadataAndError | undefined) => void
  isLoading: boolean
  selectableState: SelectableRowsHook
}
export const DocumentLogsTable = forwardRef<HTMLTableElement, Props>(
  function DocumentLogsTable(
    {
      documentLogs,
      evaluationResults,
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
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        page,
        pageSize,
      })
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
            <TableHead>Custom Identifier</TableHead>
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
                  <Text.H5 color={cellColor}>
                    {documentLog.customIdentifier || '-'}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <EvaluationsColumn
                    color={cellColor}
                    evaluationResults={evaluationResults[documentLog.id]}
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
