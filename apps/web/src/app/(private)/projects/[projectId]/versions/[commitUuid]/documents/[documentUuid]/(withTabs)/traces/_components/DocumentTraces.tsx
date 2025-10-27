'use client'

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { SpanRow } from './SpanRow'
import { KeysetTablePaginationFooter } from './KeySetTablePaginationFooter'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { Span, SpanType } from '@latitude-data/constants'

export function DocumentTraces({ initialSpans }: { initialSpans: Span[] }) {
  const { selection } = useTraceSpanSelection()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const {
    items: spans,
    count,
    goToNextPage,
    goToPrevPage,
    hasNext,
    hasPrev,
  } = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    initialItems: initialSpans,
  })

  return (
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='flex flex-col flex-grow min-h-0 relative'>
        <Table
          className='table-auto'
          externalFooter={
            <KeysetTablePaginationFooter
              setNext={goToNextPage}
              setPrev={goToPrevPage}
              hasNext={hasNext}
              hasPrev={hasPrev}
              count={count}
            />
          }
        >
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
                span={span as Span<SpanType.Prompt>}
                isSelected={selection.spanId === span.id}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
