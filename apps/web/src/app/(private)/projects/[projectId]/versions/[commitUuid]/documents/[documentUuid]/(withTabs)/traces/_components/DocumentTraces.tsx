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
import { ConversationRow } from './ConversationRow'
import { ActiveRunRow } from './ActiveRuns/ActiveRunRow'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { ActiveRun } from '@latitude-data/constants'
import { type SelectableRowsHook } from '$/hooks/useSelectableRows'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { UseConversationsReturn } from '$/stores/conversations'

export function DocumentTraces({
  ref,
  activeRuns,
  conversations,
  selectableState,
}: {
  activeRuns: ActiveRun[]
  conversations: UseConversationsReturn
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
          setNext={conversations.goToNextPage}
          setPrev={conversations.goToPrevPage}
          hasNext={conversations.hasNext}
          hasPrev={conversations.hasPrev}
          isLoading={conversations.isLoading}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>
            <Checkbox
              checked={selectableState.headerState}
              onCheckedChange={selectableState.toggleAll}
            />
          </TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Evaluations</TableHead>
          <TableHead>Traces</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activeRuns.map((run) => (
          <ActiveRunRow key={run.uuid} run={run} />
        ))}

        {conversations.items.map((conversation) => (
          <ConversationRow
            key={conversation.documentLogUuid}
            conversation={conversation}
            toggleRow={selectableState.toggleRow}
            isRowSelected={selectableState.isSelected(
              conversation.documentLogUuid ?? undefined,
            )}
            isExpanded={
              selection.expandedDocumentLogUuid === conversation.documentLogUuid
            }
          />
        ))}
      </TableBody>
    </Table>
  )
}
