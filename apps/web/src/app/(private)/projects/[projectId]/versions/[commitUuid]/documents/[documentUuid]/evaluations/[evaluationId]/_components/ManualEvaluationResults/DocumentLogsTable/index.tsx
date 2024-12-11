import { forwardRef } from 'react'
import { capitalize } from 'lodash-es'

import { EvaluationDto } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  Badge,
  Checkbox,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
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

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '..'
import { ResultCellContent } from '../../EvaluationResults/EvaluationResultsTable'
import { useCommits } from '$/stores/commitsStore'
import { useDefaultLogFilterOptions } from '$/hooks/logFilters/useDefaultLogFilterOptions'

const countLabel = (selected: number) => (count: number) => {
  return selected ? `${selected} of ${count} logs selected` : `${count} logs`
}

type Props = {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithMetadataAndErrorAndEvaluationResult[]
  selectedLog: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined
  setSelectedLog: (
    log: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined,
  ) => void
  selectableState: SelectableRowsHook
}
export const DocumentLogsTable = forwardRef<HTMLTableElement, Props>(
  function DocumentLogsTable(
    {
      evaluation,
      documentLogs,
      selectedLog,
      setSelectedLog,
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
    const { project } = useCurrentProject()
    const { commit } = useCurrentCommit()
    const { document } = useCurrentDocument()
    const { data: commits } = useCommits()
    const filterOptions = useDefaultLogFilterOptions()
    const { data: pagination, isLoading } = useDocumentLogsPagination({
      documentUuid: commits ? document.documentUuid : undefined,
      projectId: project.id,
      filterOptions,
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
            isLoading={isLoading}
            pagination={
              pagination
                ? buildPagination({
                    baseUrl: ROUTES.projects
                      .detail({ id: project.id })
                      .commits.detail({ uuid: commit.uuid })
                      .documents.detail({ uuid: document.documentUuid })
                      .evaluations.detail(evaluation.id).root,
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
            <TableHead>Origin</TableHead>
            <TableHead>Result</TableHead>
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
            const resultId = documentLog.result?.id
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
                  },
                )}
              >
                <TableCell preventDefault align='left'>
                  <Checkbox
                    fullWidth={false}
                    disabled={resultId === undefined}
                    checked={isSelected(resultId)}
                    onCheckedChange={(checked) => toggleRow(resultId, checked)}
                  />
                </TableCell>
                <TableCell>
                  <Text.H5 noWrap color={cellColor}>
                    {relativeTime(documentLog.createdAt)}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 color={cellColor}>
                    {capitalize(documentLog.source || '')}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5>
                    {documentLog.result?.result ? (
                      <ResultCellContent
                        evaluation={evaluation}
                        value={documentLog.result.result}
                      />
                    ) : (
                      <Badge variant='secondary'>Pending</Badge>
                    )}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 noWrap color={cellColor}>
                    {formatDuration(documentLog.duration)}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 noWrap>
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
