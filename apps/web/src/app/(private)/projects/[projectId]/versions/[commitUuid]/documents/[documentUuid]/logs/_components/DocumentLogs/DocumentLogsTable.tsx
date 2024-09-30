import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
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
import { TablePaginationFooter } from '$/components/TablePaginationFooter'

function countLabel(count: number) {
  return `${count} logs`
}

export const DocumentLogsTable = ({
  documentLogs,
  selectedLog,
  setSelectedLog,
  pagination,
}: {
  documentLogs: DocumentLogWithMetadata[]
  selectedLog: DocumentLogWithMetadata | undefined
  setSelectedLog: (log: DocumentLogWithMetadata | undefined) => void
  pagination: IPagination
}) => {
  return (
    <Table
      className='table-auto'
      externalFooter={
        <TablePaginationFooter
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
        {documentLogs.map((documentLog, idx) => (
          <TableRow
            key={idx}
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
              <Text.H4 noWrap>{relativeTime(documentLog.createdAt)}</Text.H4>
            </TableCell>
            <TableCell>
              <div className='flex flex-row gap-2 items-center'>
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
                <Text.H5>{documentLog.commit.title}</Text.H5>
              </div>
            </TableCell>
            <TableCell>
              <Text.H4>{documentLog.source}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4>{documentLog.customIdentifier}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 noWrap>{formatDuration(documentLog.duration)}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 noWrap>{documentLog.tokens}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 noWrap>
                {formatCostInMillicents(documentLog.costInMillicents || 0)}
              </Text.H4>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
