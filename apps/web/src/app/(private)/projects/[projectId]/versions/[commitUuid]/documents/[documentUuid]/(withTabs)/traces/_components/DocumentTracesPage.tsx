'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { SpansFilters, parseSpansFilters } from '$/lib/schemas/filters'
import useDocumentTracesAggregations from '$/stores/documentTracesAggregations'
import useDocumentTracesDailyCount from '$/stores/documentTracesDailyCount'
import { useActiveRunsByDocument } from '$/stores/runs/activeRunsByDocument'
import { useConversationsStore } from '$/stores/conversations'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useSearchParams } from 'next/navigation'
import { use, useRef, useState } from 'react'
import { ActiveRunPanel } from './ActiveRuns/ActiveRunPanel'
import { AggregationPanels } from './AggregationPanels'
import { DocumentTraces } from './DocumentTraces'
import { SpanFilters } from './Filters'
import { TracePanel } from './TracePanel'
import { TracesOverTime } from './TracesOverTime'
import { TraceSpanSelectionActionsContext } from './TraceSpanSelectionContext'
import { useTraceSelection } from './useTraceSelection'
import { useConversationUpdatedListener } from './useConversationUpdatedListener'
import { ConversationPanel } from '$/components/ConversationPanel'
import { ConversationsResponse } from '$/app/api/conversations/route'
import { SelectionTracesBanner } from './SelectionTracesBanner'

export function DocumentTracesPage({
  initialConversations,
  initialSpanFilterOptions,
}: {
  initialConversations: ConversationsResponse
  initialSpanFilterOptions: SpansFilters
}) {
  const { clearSelection } = use(TraceSpanSelectionActionsContext)
  const panelContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLTableElement>(null)
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [spanFilterOptions, setSpanFilterOptions] = useState(
    initialSpanFilterOptions,
  )
  const { data: aggregations, isLoading: isAggregationsLoading } =
    useDocumentTracesAggregations({
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    })

  const {
    data: dailyCount,
    isLoading: isDailyCountLoading,
    error: dailyCountError,
  } = useDocumentTracesDailyCount({
    documentUuid: document.documentUuid,
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const urlFilters = parseSpansFilters(filtersParam, 'DocumentTracesPage')
  const filters = urlFilters ?? initialSpanFilterOptions
  const conversations = useConversationsStore(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      filters,
    },
    {
      fallbackData: initialConversations,
    },
  )

  const selectableState = useSelectableRows({
    rowIds: conversations.items.map((c) => c.documentLogUuid!),
    totalRowCount: conversations.items.length,
  })
  const {
    data: activeRuns,
    attachRun,
    stopRun,
    isAttachingRun,
    isStoppingRun,
  } = useActiveRunsByDocument({
    project,
    commit,
    document,
    realtime: true,
    onRunEnded: clearSelection,
  })
  const selection = useTraceSelection(activeRuns)

  useConversationUpdatedListener(conversations)

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title={
          <Text.H4M noWrap ellipsis>
            Traces
          </Text.H4M>
        }
        actions={
          <SpanFilters
            filterOptions={spanFilterOptions}
            onFiltersChanged={setSpanFilterOptions}
          />
        }
        table={
          conversations.items.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <div className='flex flex-col gap-4 w-full'>
              <div className='grid xl:grid-cols-2 gap-4'>
                <TracesOverTime
                  data={dailyCount}
                  isLoading={isDailyCountLoading}
                  error={dailyCountError}
                />
                <AggregationPanels
                  aggregations={aggregations}
                  isLoading={isAggregationsLoading}
                />
              </div>
              <TableResizableLayout
                showRightPane={selection.any}
                rightPaneRef={panelContainerRef}
                leftPane={
                  <DocumentTraces
                    ref={panelRef}
                    conversations={conversations}
                    activeRuns={activeRuns}
                    selectableState={selectableState}
                  />
                }
                floatingPanel={
                  <SelectionTracesBanner
                    selectableState={selectableState}
                    filters={filters}
                  />
                }
                rightPane={
                  selection.any ? (
                    <TracePanel
                      panelContainerRef={panelContainerRef}
                      panelRef={panelRef}
                    >
                      {({ ref }) =>
                        selection.active ? (
                          <ActiveRunPanel
                            ref={ref}
                            run={selection.active.run}
                            attachRun={attachRun}
                            stopRun={stopRun}
                            isAttachingRun={isAttachingRun}
                            isStoppingRun={isStoppingRun}
                          />
                        ) : selection.conversation ? (
                          <ConversationPanel
                            ref={ref}
                            documentLogUuid={
                              selection.conversation.documentLogUuid
                            }
                            documentUuid={document.documentUuid}
                            commitUuid={selection.conversation.commitUuid}
                          />
                        ) : selection.trace ? (
                          <TraceInfoPanel
                            ref={ref}
                            documentLogUuid={selection.trace.documentLogUuid}
                            spanId={selection.trace.spanId}
                            documentUuid={document.documentUuid}
                          />
                        ) : null
                      }
                    </TracePanel>
                  ) : null
                }
              />
            </div>
          )
        }
      />
    </div>
  )
}
