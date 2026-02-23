'use client'

import { useProcessSpanFilters } from '$/hooks/spanFilters/useProcessSpanFilters'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { TraceInfoPanel } from '$/components/traces/TraceInfoPanel'
import { SpansFilters, parseSpansFilters } from '$/lib/schemas/filters'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSearchParams } from 'next/navigation'
import { SpanType } from '@latitude-data/constants'
import { useRef, useState, use } from 'react'
import {
  TraceSpanSelectionProvider,
  TraceSpanSelectionStateContext,
} from '$/components/traces/TraceSpanSelectionContext'
import { ProjectTraces } from './ProjectTraces'
import { TracePanel } from '$/components/traces/TracePanel'

function ProjectSpanFilters({
  filterOptions,
  onFiltersChanged,
}: {
  filterOptions: SpansFilters
  onFiltersChanged: ReactStateDispatch<SpansFilters>
}) {
  const filters = useProcessSpanFilters({
    onFiltersChanged,
    filterOptions,
  })

  return (
    <DatePickerRange
      showPresets
      initialRange={
        filterOptions?.createdAt?.from
          ? (filterOptions.createdAt as { from: Date; to: Date | undefined })
          : undefined
      }
      onCloseChange={filters.onCreatedAtChange}
    />
  )
}

function ProjectTracesPageContent({
  initialSpanFilterOptions,
}: {
  initialSpanFilterOptions: SpansFilters
}) {
  const panelContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLTableElement>(null)
  const { project } = useCurrentProject()
  const { selection } = use(TraceSpanSelectionStateContext)
  const [spanFilterOptions, setSpanFilterOptions] = useState(
    initialSpanFilterOptions,
  )

  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const urlFilters = parseSpansFilters(filtersParam, 'ProjectTracesPage')
  const filters = urlFilters ?? initialSpanFilterOptions

  const traces = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    types: [SpanType.Prompt, SpanType.External],
    filters,
  })

  const selectedSpan =
    traces.items.find(
      (span) => span.documentLogUuid === selection.documentLogUuid,
    ) ?? null

  const hasSelection = !!selection.documentLogUuid && !!selection.spanId

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title={
          <Text.H4M noWrap ellipsis>
            Traces
          </Text.H4M>
        }
        actions={
          <ProjectSpanFilters
            filterOptions={spanFilterOptions}
            onFiltersChanged={setSpanFilterOptions}
          />
        }
        table={
          !traces.items.length && !traces.isLoading ? (
            <TableBlankSlate description='No traces found for this project.' />
          ) : (
            <TableResizableLayout
              showRightPane={hasSelection}
              rightPaneRef={panelContainerRef}
              leftPane={<ProjectTraces traces={traces} />}
              rightPane={
                hasSelection ? (
                  <TracePanel
                    panelContainerRef={panelContainerRef}
                    panelRef={panelRef}
                  >
                    {({ ref }) => (
                      <TraceInfoPanel
                        ref={ref}
                        documentLogUuid={selection.documentLogUuid!}
                        spanId={selection.spanId!}
                        documentUuid={selectedSpan?.documentUuid ?? ''}
                      />
                    )}
                  </TracePanel>
                ) : null
              }
            />
          )
        }
      />
    </div>
  )
}

export function ProjectTracesPage({
  initialSpanFilterOptions,
}: {
  initialSpanFilterOptions: SpansFilters
}) {
  return (
    <TraceSpanSelectionProvider>
      <ProjectTracesPageContent
        initialSpanFilterOptions={initialSpanFilterOptions}
      />
    </TraceSpanSelectionProvider>
  )
}
