'use client'

import { Ref, use, useCallback } from 'react'
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
import {
  serializeSpans,
  useSpansKeysetPaginationStore,
} from '$/stores/spansKeysetPagination'
import { ActiveRun, Span, SpanType } from '@latitude-data/constants'
import { type SelectableRowsHook } from '$/hooks/useSelectableRows'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { useEvaluationResultsV2ByTraces } from '$/stores/evaluationResultsV2'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'

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

  // Listen for new spans being created and add them to the list
  const onSpanCreated = useCallback(
    (args: EventArgs<'spanCreated'>) => {
      if (!args) return
      if (args.documentUuid !== document.documentUuid) return

      // Only add to list if we're on the first page (no cursor)
      const isFirstPage = !spans.currentCursor
      if (!isFirstPage) return

      const span = serializeSpans([args.span])[0]
      spans.mutate(
        (prev) => {
          if (!prev) return prev

          // Check if span already exists (avoid duplicates)
          const exists = prev.items.some((s) => s.traceId === span.traceId)
          if (exists) return prev

          return {
            ...prev,
            items: [span, ...prev.items],
            count: prev.count ? prev.count + 1 : null,
          }
        },
        { revalidate: false },
      )
    },
    [document.documentUuid, spans.currentCursor, spans.mutate],
  )
  useSockets({ event: 'spanCreated', onMessage: onSpanCreated })

  const {
    dataByTraceId: evaluationResultsByTraceId,
    isLoading: isEvaluationResultsLoading,
  } = useEvaluationResultsV2ByTraces({
    project,
    commit,
    document,
    traceIds: spans.items.map((span) => span.traceId),
  })

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
            span={span as Span<SpanType.Prompt>}
            toggleRow={selectableState.toggleRow}
            isSelected={selectableState.isSelected}
            isExpanded={selection.traceId === span.traceId}
            evaluationResults={evaluationResultsByTraceId[span.traceId] || []}
            isEvaluationResultsLoading={isEvaluationResultsLoading}
          />
        ))}
      </TableBody>
    </Table>
  )
}
