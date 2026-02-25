'use client'

import { Ref, use } from 'react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { TraceSpanSelectionStateContext } from './TraceSpanSelectionContext'
import { TraceRow } from './ConversationRow'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { UseSpansKeysetPaginationReturn } from '$/stores/spansKeysetPagination/types'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'

export function DocumentTraces({
  ref,
  traces,
  selectableState,
}: {
  traces: UseSpansKeysetPaginationReturn
  selectableState: SelectableRowsHook
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
          <TableHead>
            <Checkbox
              fullWidth={false}
              checked={selectableState.headerState}
              onCheckedChange={selectableState.toggleAll}
            />
          </TableHead>
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
            toggleRow={selectableState.toggleRow}
            isRowSelected={selectableState.isSelected(
              span.documentLogUuid ?? '',
            )}
          />
        ))}
      </TableBody>
    </Table>
  )
}
