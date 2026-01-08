'use client'

import { Ref, use } from 'react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'
import { SpanRow } from './SpanRow'
import { ActiveRunRow } from './ActiveRuns/ActiveRunRow'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { ActiveRun, PromptSpan } from '@latitude-data/constants'
import { type SelectableRowsHook } from '$/hooks/useSelectableRows'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { useEvaluationResultsV2ByTraces } from '$/stores/evaluationResultsV2'
import { useSpanCreatedListener } from './useSpanCreatedListener'

export function DocumentTraces({
  ref,
  activeRuns,
  spans,
  selectableState,
}: {
  activeRuns: ActiveRun[]
  spans: ReturnType<typeof useSpansKeysetPaginationStore>
  selectableState: SelectableRowsHook
  ref?: Ref<HTMLTableElement>
}) {
  const { selection } = use(TraceSpanSelectionContext)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const {
    dataByTraceId: evaluationResultsByTraceId,
    isLoading: isEvaluationResultsLoading,
  } = useEvaluationResultsV2ByTraces({
    project,
    commit,
    document,
    traceIds: spans.items.map((span) => span.traceId),
  })

  // Updates span store paginated state with realtime spans
  useSpanCreatedListener(spans)

  return (
    <Table
      ref={ref}
      className='table-auto'
      externalFooter={
        <SimpleKeysetTablePaginationFooter
          setNext={spans.goToNextPage}
          setPrev={spans.goToPrevPage}
          hasNext={spans.hasNext}
          hasPrev={spans.hasPrev}
          count={spans.count}
          countLabel={(count) => `${count} traces`}
          isLoading={spans.isLoading}
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {activeRuns.map((run) => (
          <ActiveRunRow key={run.uuid} run={run} />
        ))}

        {spans.items.map((span) => (
          <SpanRow
            key={span.id}
            span={span as PromptSpan}
            toggleRow={selectableState.toggleRow}
            isSelected={selectableState.isSelected}
            isExpanded={
              selection.documentLogUuid !== null &&
              (selection.documentLogUuid === span.documentLogUuid ||
                selection.expandedDocumentLogUuid === span.documentLogUuid)
            }
            evaluationResults={evaluationResultsByTraceId[span.traceId] || []}
            isEvaluationResultsLoading={isEvaluationResultsLoading}
          />
        ))}
      </TableBody>
    </Table>
  )
}
