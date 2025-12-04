'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ROUTES } from '$/services/routes'
import { useCompletedRunsCount } from '$/stores/runs/completedRuns'
import { useCompletedRunsKeysetPaginationStore } from '$/stores/completedRunsKeysetPagination'
import {
  CompletedRun,
  LogSources,
  Run,
  RUN_SOURCES,
  RunSourceGroup,
} from '@latitude-data/constants'
import { ProjectLimitedView } from '@latitude-data/core/schema/models/types/Project'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useDebounce } from 'use-debounce'
import { RunPanel } from './RunPanel'
import { RunsList } from './RunsList'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

function sumCounts(
  counts: Record<LogSources, number> | undefined,
  sourceGroup: RunSourceGroup,
): number {
  if (!counts) return 0
  const sources = RUN_SOURCES[sourceGroup]
  return sources.reduce((sum, source) => sum + (counts[source] ?? 0), 0)
}

export function RunsPage({
  issuesEnabled,
  completed: serverCompleted,
  limitedView,
  defaultSourceGroup,
}: {
  issuesEnabled: boolean
  completed: { runs: CompletedRun[] }
  limitedView?: Pick<ProjectLimitedView, 'totalRuns'>
  defaultSourceGroup: RunSourceGroup
}) {
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
      .runs.root({
        sourceGroup: debouncedSourceGroup,
      })

    const targetUrl = `${window.location.origin}${runsRoute}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', runsRoute)
    }
  }, [project.id, commit.uuid, debouncedSourceGroup])

  const {
    items: completedRuns,
    goToNextPage,
    goToPrevPage,
    hasNext,
    hasPrev,
    isLoading: isCompletedRunsLoading,
    reset: resetCompletedPagination,
  } = useCompletedRunsKeysetPaginationStore(
    {
      projectId: project.id,
      initialItems: serverCompleted.runs,
      sourceGroup: debouncedSourceGroup,
    },
    { keepPreviousData: true },
  )

  // Reset pagination when sourceGroup changes
  useEffect(() => {
    resetCompletedPagination()
  }, [debouncedSourceGroup, resetCompletedPagination])

  const { data: completedCountBySource, isLoading: isCompletedCountLoading } =
    useCompletedRunsCount({
      project,
      sourceGroup: debouncedSourceGroup,
      disable: !!limitedView,
    })

  const completedTotalCount = useMemo(
    () => sumCounts(completedCountBySource, debouncedSourceGroup),
    [completedCountBySource, debouncedSourceGroup],
  )

  const isCompletedLoading = isCompletedRunsLoading || isCompletedCountLoading

  // Note: searching the run this way to allow for real time updates
  const [selectedRunUuid, setSelectedRunUuid] = useState<string>()
  const selectedRun = useMemo(() => {
    return (
      completedRuns.find((run) => run.uuid === selectedRunUuid)
    ) as Run | undefined // prettier-ignore
  }, [completedRuns, selectedRunUuid])

  return (
    <div className='w-full h-full flex items-center justify-center'>
      <SplitPane
        direction='horizontal'
        initialPercentage={50}
        minSize={400}
        firstPane={
          <RunsList
            issuesEnabled={issuesEnabled}
            sourceGroup={debouncedSourceGroup}
            setSourceGroup={setSourceGroup}
            completed={{
              runs: completedRuns,
              goToNextPage,
              goToPrevPage,
              hasNext,
              hasPrev,
              countBySource: completedCountBySource,
              totalCount: completedTotalCount ?? limitedView?.totalRuns,
              isLoading: isCompletedLoading,
              limitedView,
            }}
            selectedRunUuid={selectedRunUuid}
            setSelectedRunUuid={setSelectedRunUuid}
          />
        }
        secondPane={
          selectedRun ? (
            <RunPanel
              key={selectedRun.uuid}
              run={selectedRun}
              sourceGroup={debouncedSourceGroup}
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
