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
  spans: Span[]
  selectableState: SelectableRowsHook
  ref?: Ref<HTMLTableElement>
}) {
  const { selection } = use(TraceSpanSelectionContext)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const {
    count,
    goToNextPage,
    goToPrevPage,
    hasNext,
    hasPrev,
    isLoading,
    currentCursor,
    mutate: mutateSpans,
  } = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

  // Listen for new spans being created and add them to the list
  const onSpanCreated = useCallback(
    (args: EventArgs<'spanCreated'>) => {
      if (!args) return
      if (args.documentUuid !== document.documentUuid) return

      // Only add to list if we're on the first page (no cursor)
      const isFirstPage = !currentCursor
      if (!isFirstPage) return

      const span = serializeSpans([args.span])[0]
      mutateSpans(
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
    [document.documentUuid, currentCursor, mutateSpans],
  )
  useSockets({ event: 'spanCreated', onMessage: onSpanCreated })

  const {
    dataByTraceId: evaluationResultsByTraceId,
    isLoading: isEvaluationResultsLoading,
  } = useEvaluationResultsV2ByTraces({
    project,
    commit,
    document,
    traceIds: spans.map((span) => span.traceId),
  })

  return (
    <Table
      ref={ref}
      className='table-auto'
      externalFooter={
        <SimpleKeysetTablePaginationFooter
          setNext={goToNextPage}
          setPrev={goToPrevPage}
          hasNext={hasNext}
          hasPrev={hasPrev}
          count={count}
          countLabel={(count) => `${count} traces`}
          isLoading={isLoading}
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

        {spans.map((span) => (
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
