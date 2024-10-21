import { capitalize } from 'lodash-es'

import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
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
} from '@latitude-data/web-ui'
import {
  formatCostInMillicents,
  formatDuration,
  relativeTime,
} from '$/app/_lib/formatUtils'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'

function countLabel(count: number) {
  return `${count} logs`
}

type DocumentLogRow = DocumentLogWithMetadataAndError & {
  realtimeAdded?: boolean
}

export const DocumentLogsTable = ({
  documentLogs,
  selectedLog,
  setSelectedLog,
  pagination,
}: {
  documentLogs: DocumentLogRow[]
  selectedLog: DocumentLogWithMetadataAndError | undefined
  setSelectedLog: (log: DocumentLogWithMetadataAndError | undefined) => void
  pagination: IPagination
}) => {
  return (
    <Table
      className='table-auto'
      externalFooter={
        <LinkableTablePaginationFooter
          pagination={pagination}
          countLabel={countLabel}
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
          const cellColor = error ? 'destructiveMutedForeground' : 'foreground'
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
              <TableCell>
                <Text.H4 noWrap color={cellColor}>
                  {relativeTime(documentLog.createdAt)}
                </Text.H4>
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
                <Text.H4 color={cellColor}>
                  {capitalize(documentLog.source || '')}
                </Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4 color={cellColor}>
                  {documentLog.customIdentifier}
                </Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4 noWrap color={cellColor}>
                  {formatDuration(documentLog.duration)}
                </Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4 noWrap color={cellColor}>
                  {typeof documentLog.tokens === 'number'
                    ? documentLog.tokens
                    : '-'}
                </Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4 noWrap color={cellColor}>
                  {typeof documentLog.costInMillicents === 'number'
                    ? formatCostInMillicents(documentLog.costInMillicents)
                    : '-'}
                </Text.H4>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
