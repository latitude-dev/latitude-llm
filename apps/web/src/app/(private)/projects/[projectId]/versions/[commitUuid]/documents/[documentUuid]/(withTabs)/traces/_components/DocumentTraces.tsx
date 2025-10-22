'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { Span } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Trace } from './Trace'
import { cn } from '@latitude-data/web-ui/utils'
import { useSelectedTraceId } from './SelectedTraceIdContext'
import { Fragment } from 'react'
import { useSelectedSpan } from './SelectedSpansContext'

export function DocumentTraces({ spans }: { spans: Span[] }) {
  const { selectedTraceId, setSelectedTraceId } = useSelectedTraceId()
  const { setSelectedSpanId } = useSelectedSpan()

  return (
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='flex flex-col flex-grow min-h-0 relative'>
        <Table className='table-auto'>
          <TableHeader className='sticky top-0 z-10'>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spans.map((span) => (
              <Fragment key={span.id}>
                <TableRow
                  key={`${span.traceId}-${span.id}`}
                  onClick={() => {
                    setSelectedTraceId(span.traceId)
                    setSelectedSpanId(span.id)
                  }}
                  className={cn(
                    'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                    {
                      'bg-secondary': selectedTraceId === span.traceId,
                    },
                  )}
                >
                  <TableCell>
                    <Text.H5 noWrap>{relativeTime(span.startedAt)}</Text.H5>
                  </TableCell>
                  <TableCell>
                    <Badge variant='muted'>{span.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap ellipsis>
                      {span.name}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        span.status === 'ok'
                          ? 'success'
                          : span.status === 'error'
                            ? 'destructive'
                            : 'muted'
                      }
                    >
                      {span.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>{formatDuration(span.duration)}</Text.H5>
                  </TableCell>
                </TableRow>
                {selectedTraceId && span.traceId === selectedTraceId && (
                  <TableRow hoverable={false}>
                    <TableCell
                      colSpan={999}
                      className='max-w-full w-full h-full !p-0'
                      innerClassName='w-full h-full flex !justify-center !items-center'
                    >
                      <Trace traceId={selectedTraceId} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
