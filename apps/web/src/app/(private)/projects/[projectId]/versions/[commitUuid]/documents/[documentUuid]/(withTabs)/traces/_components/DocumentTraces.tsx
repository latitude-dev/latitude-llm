'use client'

import { Ref, use } from 'react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TraceSpanSelectionStateContext } from './TraceSpanSelectionContext'
import { TraceRow } from './ConversationRow'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { UseSpansKeysetPaginationReturn } from '$/stores/spansKeysetPagination/types'

export function DocumentTraces({
  ref,
  traces,
}: {
  traces: UseSpansKeysetPaginationReturn
  ref?: Ref<HTMLTableElement>
}) {
  const { selection } = use(TraceSpanSelectionStateContext)

  return (
    <Table
      ref={ref}
      className='table-auto'
      externalFooter={
        <SimpleKeysetTablePaginationFooter
          setNext={traces.goToNextPage}
          setPrev={traces.goToPrevPage}
          hasNext={traces.hasNext}
          hasPrev={traces.hasPrev}
          isLoading={traces.isLoading}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Tokens</TableHead>
          <TableHead>Evaluations</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {traces.items.map((span) => (
          <TraceRow
            key={span.traceId}
            span={span}
            isExpanded={
              !!span.documentLogUuid &&
              selection.documentLogUuid === span.documentLogUuid
            }
          />
        ))}
      </TableBody>
    </Table>
  )
}
