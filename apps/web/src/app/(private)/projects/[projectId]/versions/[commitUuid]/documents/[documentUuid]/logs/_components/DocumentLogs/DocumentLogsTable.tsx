import { forwardRef } from 'react'
import { capitalize } from 'lodash-es'

import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
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
import {
  formatCostInMillicents,
  formatDuration,
  relativeTime,
} from '$/app/_lib/formatUtils'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { ROUTES } from '$/services/routes'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import { useSearchParams } from 'next/navigation'

function countLabel(count: number) {
  return `${count} logs`
}

type Props = {
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog: DocumentLogWithMetadataAndError | undefined
  setSelectedLog: (log: DocumentLogWithMetadataAndError | undefined) => void
}
export const DocumentLogsTable = forwardRef<HTMLTableElement, Props>(
  function DocomentLogsTable(
    { documentLogs, selectedLog, setSelectedLog },
    ref,
  ) {
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
        ref={ref}
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
            <TableHead>Time</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Custom Identifier</TableHead>
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
            const realtimeAdded =
              'realtimeAdded' in documentLog ? documentLog.realtimeAdded : false
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
                    'animate-flash': realtimeAdded,
                  },
                )}
              >
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
                    {capitalize(documentLog.source || '')}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <Text.H5 color={cellColor}>
                    {documentLog.customIdentifier}
                  </Text.H5>
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
