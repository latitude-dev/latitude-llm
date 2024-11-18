import { capitalize } from 'lodash-es'

import { EvaluationDto } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  Badge,
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
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import { useSearchParams } from 'next/navigation'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '..'
import { ResultCellContent } from '../../EvaluationResults/EvaluationResultsTable'

function countLabel(count: number) {
  return `${count} logs`
}

export function DocumentLogsTable({
  evaluation,
  documentLogs,
  selectedLog,
  setSelectedLog,
}: {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithMetadataAndErrorAndEvaluationResult[]
  selectedLog: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined
  setSelectedLog: (
    log: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined,
  ) => void
}) {
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const document = useCurrentDocument()
  const { data: pagination, isLoading } = useDocumentLogsPagination({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    page,
    pageSize,
  })
  return (
    <Table
      className='table-auto'
      externalFooter={
        <LinkableTablePaginationFooter
          countLabel={countLabel}
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
              <TableCell>
                <Text.H5 noWrap>{relativeTime(documentLog.createdAt)}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>{capitalize(documentLog.source || '')}</Text.H5>
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
                <Text.H5 noWrap>{formatDuration(documentLog.duration)}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap>
                  {typeof documentLog.tokens === 'number'
                    ? documentLog.tokens
                    : '-'}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap>
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
}
