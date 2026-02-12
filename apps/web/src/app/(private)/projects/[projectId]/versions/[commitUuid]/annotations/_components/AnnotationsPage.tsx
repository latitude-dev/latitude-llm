'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ROUTES } from '$/services/routes'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { useEvaluationResultsV2ByTraces } from '$/stores/evaluationResultsV2'
import {
  EvaluationType,
  EvaluationV2,
  MAIN_SPAN_TYPES,
  MainSpanType,
  RunSourceGroup,
  Span,
  SpanWithDetails,
} from '@latitude-data/constants'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useDebounce } from 'use-debounce'
import { AnnotationsPanel } from './AnnotationPanel'
import { AnnotationsList } from './AnnotationsList'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useSearchParams } from 'next/navigation'
import { mapSourceGroupToLogSources } from '@latitude-data/core/services/runs/mapSourceGroupToLogSources'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'

export function AnnotationsPage({
  issuesEnabled,
  initialSpans,
  defaultSourceGroup,
}: {
  issuesEnabled: boolean
  initialSpans: Span[]
  defaultSourceGroup: RunSourceGroup
}) {
  const searchParams = useSearchParams()
  const realtime = searchParams.get('realtime')
  const [realtimeIsEnabled, setRealtimeIsEnabled] = useState(
    realtime === 'true' ? true : false,
  )
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [sourceGroup, setSourceGroup] =
    useState<RunSourceGroup>(defaultSourceGroup)
  const [debouncedSourceGroup] = useDebounce(sourceGroup, 100)
  const { setValue: setLastRunTab } = useLocalStorage<RunSourceGroup>({
    key: AppLocalStorage.lastRunTab,
    defaultValue: RunSourceGroup.Playground,
  })

  useEffect(() => {
    setLastRunTab(debouncedSourceGroup)
  }, [debouncedSourceGroup, setLastRunTab])

  useEffect(() => {
    const runsRoute = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .annotations.root({
        sourceGroup: debouncedSourceGroup,
      })

    const targetUrl = `${window.location.origin}${runsRoute}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', runsRoute)
    }
  }, [project.id, commit.uuid, debouncedSourceGroup])

  const logSources = mapSourceGroupToLogSources(debouncedSourceGroup)
  const {
    items: spans,
    goToNextPage,
    goToPrevPage,
    hasNext,
    hasPrev,
    isLoading: isSpansLoading,
    reset: resetSpansPagination,
    count: totalSpansCount,
  } = useSpansKeysetPaginationStore(
    {
      projectId: project.id.toString(),
      commitUuid: commit.uuid,
      types: Array.from(MAIN_SPAN_TYPES),
      initialItems: initialSpans,
      source: logSources,
      realtime: realtimeIsEnabled,
    },
    { keepPreviousData: true },
  )

  const traceIds = useMemo(() => spans.map((span) => span.traceId), [spans])
  const { data: evaluations } = useEvaluationsV2({ project, commit })
  const { data: annotations = [], mutate: mutateAnnotations } =
    useEvaluationResultsV2ByTraces(
      {
        project: { id: project.id },
        commit: { uuid: commit.uuid },
        traceIds,
        disabled: realtimeIsEnabled,
      },
      { keepPreviousData: true },
    )
  const hitlAnnotations = useMemo(() => {
    return annotations.filter((a) => {
      const evaluation = evaluations.find((ev) => ev.uuid === a.evaluationUuid)
      if (!evaluation) return false

      return (
        evaluation.type === EvaluationType.Human &&
        (evaluation as EvaluationV2<EvaluationType.Human>).configuration
          .enableControls
      )
    })
  }, [annotations, evaluations])

  // Reset pagination when sourceGroup changes
  useEffect(() => {
    resetSpansPagination()
  }, [debouncedSourceGroup, resetSpansPagination])

  // Note: searching the span this way to allow for real time updates
  const [selectedSpanId, setSelectedSpanId] = useState<string>()
  const selectedSpan = useMemo(
    () => spans.find((span) => span.id === selectedSpanId),
    [spans, selectedSpanId],
  )
  const onAnnotate = useCallback(() => {
    mutateAnnotations()
  }, [mutateAnnotations])

  return (
    <div className='w-full h-full flex items-center justify-center'>
      <SplitPane
        direction='horizontal'
        initialPercentage={50}
        minSize={400}
        firstPane={
          <AnnotationsList
            annotations={hitlAnnotations}
            goToNextPage={goToNextPage}
            goToPrevPage={goToPrevPage}
            hasNext={hasNext}
            hasPrev={hasPrev}
            isLoading={isSpansLoading}
            issuesEnabled={issuesEnabled}
            realtimeIsEnabled={realtimeIsEnabled}
            selectedSpanId={selectedSpanId}
            setSelectedSpanId={setSelectedSpanId}
            setSourceGroup={setSourceGroup}
            sourceGroup={debouncedSourceGroup}
            spans={spans}
            toggleRealtime={setRealtimeIsEnabled}
            totalCount={totalSpansCount}
          />
        }
        secondPane={
          selectedSpan ? (
            <AnnotationsPanel
              key={selectedSpan.id}
              span={selectedSpan as SpanWithDetails<MainSpanType>}
              onAnnotate={onAnnotate}
            />
          ) : (
            <div className='w-full h-full flex flex-col gap-6 p-6 overflow-hidden relative'>
              <div className='w-full h-full flex items-center justify-center gap-2 py-9 px-6 border border-border border-dashed rounded-xl'>
                <Text.H5 color='foregroundMuted'>No trace selected</Text.H5>
              </div>
            </div>
          )
        }
      />
    </div>
  )
}
