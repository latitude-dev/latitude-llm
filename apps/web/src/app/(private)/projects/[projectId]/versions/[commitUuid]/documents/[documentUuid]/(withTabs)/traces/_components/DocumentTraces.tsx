'use client'

import { Span, SpanType } from '@latitude-data/constants'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { useSelectedTraceId } from './SelectedTraceIdContext'
import { SpanRow } from './SpanRow'

export function DocumentTraces({ spans }: { spans: Span<SpanType.Prompt>[] }) {
  const { selectedTraceId } = useSelectedTraceId()

  return (
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='flex flex-col flex-grow min-h-0 relative'>
        <Table className='table-auto'>
          <TableHeader className='sticky top-0 z-10'>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spans.map((span) => (
              <SpanRow
                key={span.id}
                span={span}
                isSelected={selectedTraceId === span.traceId}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
