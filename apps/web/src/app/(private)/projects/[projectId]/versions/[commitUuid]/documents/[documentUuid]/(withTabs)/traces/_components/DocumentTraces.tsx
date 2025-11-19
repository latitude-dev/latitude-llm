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
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { Span, SpanType } from '@latitude-data/constants'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { DownloadSpansButton } from './DownloadSpansButton'
import { SaveSpansAsDatasetModal } from './SaveSpansAsDatasetModal'
import { useSelectedSpans } from './SaveSpansAsDatasetModal/useSelectedSpans'
import { useEvaluationResultsV2ByTraces } from '$/stores/evaluationResultsV2'

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
    isLoading,
  } = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    initialItems: initialSpans,
  })
  const selectableState = useSelectableRows({
    rowIds: spans.map((span) => span.id),
    totalRowCount: count ?? spans.length,
  })
  const previewSpansState = useSelectedSpans({
    selectableState,
    spans,
  })

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
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='flex flex-col flex-grow min-h-0 relative'>
        <Table
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
              <TableHead>Evaluations</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spans.map((span) => (
              <SpanRow
                key={span.id}
                span={span as Span<SpanType.Prompt>}
                toggleRow={selectableState.toggleRow}
                isSelected={selectableState.isSelected}
                isExpanded={selection.traceId === span.traceId}
                evaluationResults={
                  evaluationResultsByTraceId[span.traceId] || []
                }
                isEvaluationResultsLoading={isEvaluationResultsLoading}
              />
            ))}
          </TableBody>
        </Table>
        <div className='fixed bottom-4 w-full'>
          <div className='flex justify-center'>
            <FloatingPanel visible={selectableState.selectedCount > 0}>
              <div className='flex flex-row items-center gap-x-4'>
                <div className='flex flex-row gap-x-2'>
                  <Button
                    fancy
                    disabled={selectableState.selectedCount === 0}
                    onClick={previewSpansState.onClickShowPreview}
                  >
                    Add {selectableState.selectedCount} spans to dataset
                  </Button>
                  <DownloadSpansButton
                    selectableState={selectableState}
                    spans={spans}
                  />
                </div>
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      iconProps={{
                        name: 'close',
                      }}
                      className='p-0'
                      variant='ghost'
                      onClick={selectableState.clearSelections}
                    />
                  }
                >
                  Clear selection
                </Tooltip>
              </div>
            </FloatingPanel>
          </div>
        </div>
      </div>
      <SaveSpansAsDatasetModal {...previewSpansState} />
    </div>
  )
}
