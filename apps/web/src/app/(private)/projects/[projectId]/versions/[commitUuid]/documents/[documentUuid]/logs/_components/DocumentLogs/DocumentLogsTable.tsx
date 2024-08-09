'use client'

import { DocumentLogWithMetadata } from '@latitude-data/core'
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

import { formatCost, formatDuration, relativeTime } from './utils'

export const DocumentLogsTable = ({
  documentLogs,
  selectedLog,
  setSelectedLog,
}: {
  documentLogs: DocumentLogWithMetadata[]
  selectedLog: DocumentLogWithMetadata | null
  setSelectedLog: (log: DocumentLogWithMetadata | null) => void
}) => {
  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead className='whitespace-nowrap'>Time</TableHead>
          <TableHead className='whitespace-nowrap'>Version</TableHead>
          <TableHead className='whitespace-nowrap'>Custom Identifier</TableHead>
          <TableHead className='whitespace-nowrap'>Duration</TableHead>
          <TableHead className='whitespace-nowrap'>Tokens</TableHead>
          <TableHead className='whitespace-nowrap'>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {documentLogs.map((documentLog, idx) => (
          <TableRow
            key={idx}
            onClick={() =>
              setSelectedLog(
                selectedLog?.uuid === documentLog.uuid ? null : documentLog,
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
                  <Text.H6>
                    {documentLog.commit.version
                      ? `v${documentLog.commit.version}`
                      : 'Draft'}
                  </Text.H6>
                </Badge>
                <Text.H5>{documentLog.commit.title}</Text.H5>
              </div>
            </TableCell>
            <TableCell>
              <Text.H4>{documentLog.customIdentifier}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4>{formatDuration(documentLog.duration)}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4>{documentLog.tokens}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4>{formatCost(documentLog.cost || 0)}</Text.H4>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
