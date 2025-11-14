'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ROUTES } from '$/services/routes'
import { ActiveRunsCountContext } from '../../_components/ActiveRunsCountProvider'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import { useCompletedRunsCount } from '$/stores/runs/completedRuns'
import { useCompletedRunsKeysetPaginationStore } from '$/stores/completedRunsKeysetPagination'
import {
  ActiveRun,
  CompletedRun,
  LogSources,
  Run,
  RUN_SOURCES,
  RunSourceGroup,
} from '@latitude-data/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { ProjectLimitedView } from '@latitude-data/core/schema/models/types/Project'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useEffect, useMemo, useState, use } from 'react'
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

// Group search state by selected sourceGroup tab
function useSearchByGroup({
  defaultSearch,
  sourceGroup,
}: {
  defaultSearch: Pagination
  sourceGroup: RunSourceGroup
}): {
  search: Pagination
  setSearch: (search: Pagination) => void
  debouncedSearch: Pagination
} {
  const [searchByGroup, setSearchByGroup] = useState<
    Record<RunSourceGroup, Pagination>
  >({
    ...(Object.fromEntries(
      Object.values(RunSourceGroup).map((group) => [
        group,
        { page: 1, pageSize: defaultSearch.pageSize },
      ]),
    ) as Record<RunSourceGroup, Pagination>),
    [sourceGroup]: defaultSearch,
  })

  const search = useMemo(
    () => searchByGroup[sourceGroup],
    [searchByGroup, sourceGroup],
  )
  const setSearch = useCallback(
    (search: Pagination) => {
      setSearchByGroup((prev) => ({ ...prev, [sourceGroup]: search }))
    },
    [sourceGroup],
  )

  const [debouncedSearch] = useDebounce(search, 100)

  return { search, setSearch, debouncedSearch }
}

export function RunsPage({
  active: serverActive,
  completed: serverCompleted,
  limitedView,
  defaultSourceGroup,
}: {
  active: { runs: ActiveRun[]; search: Pagination }
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

  const {
    search: activeSearch,
    setSearch: setActiveSearch,
    debouncedSearch: debouncedActiveSearch,
  } = useSearchByGroup({
    defaultSearch: serverActive.search,
    sourceGroup,
  })

  useEffect(() => {
    const runsRoute = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .runs.root({
        activePage: debouncedActiveSearch.page,
        activePageSize: debouncedActiveSearch.pageSize,
        sourceGroup: debouncedSourceGroup,
      })

    const targetUrl = `${window.location.origin}${runsRoute}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', runsRoute)
    }
  }, [project.id, commit.uuid, debouncedActiveSearch, debouncedSourceGroup])

  const [realtime, setRealtime] = useState(!limitedView)

  const {
    data: activeRuns,
    attachRun,
    isAttachingRun,
    stopRun,
    isStoppingRun,
    isLoading: isActiveRunsLoading,
  } = useActiveRuns(
    {
      project,
      search: {
        ...debouncedActiveSearch,
        sourceGroup: debouncedSourceGroup,
      },
      realtime,
    },
    { fallbackData: serverActive.runs, keepPreviousData: true },
  )
  // Note: prefetch next results
  const { data: nextActiveRuns } = useActiveRuns({
    project,
    search: {
      ...debouncedActiveSearch,
      page: (debouncedActiveSearch.page ?? 1) + 1,
      sourceGroup: debouncedSourceGroup,
    },
    realtime: false,
  })

  const { data: activeCountBySource, isLoading: isActiveCountLoading } = use(
    ActiveRunsCountContext,
  )

  const activeTotalCount = useMemo(
    () => sumCounts(activeCountBySource, debouncedSourceGroup),
    [activeCountBySource, debouncedSourceGroup],
  )
  const isActiveLoading = isActiveRunsLoading || isActiveCountLoading

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
    useCompletedRunsCount({ project, realtime, disable: !!limitedView })

  const completedTotalCount = useMemo(
    () => sumCounts(completedCountBySource, debouncedSourceGroup),
    [completedCountBySource, debouncedSourceGroup],
  )

  const isCompletedLoading = isCompletedRunsLoading || isCompletedCountLoading

  // Note: searching the run this way to allow for real time updates
  const [selectedRunUuid, setSelectedRunUuid] = useState<string>()
  const selectedRun = useMemo(() => {
    return (
      activeRuns.find((run) => run.uuid === selectedRunUuid) ||
      completedRuns.find((run) => run.uuid === selectedRunUuid)
    ) as Run | undefined // prettier-ignore
  }, [activeRuns, completedRuns, selectedRunUuid])

  return (
    <div className='w-full h-full flex items-center justify-center'>
      <SplitPane
        direction='horizontal'
        initialPercentage={50}
        minSize={400}
        firstPane={
          <RunsList
            active={{
              runs: activeRuns,
              next: nextActiveRuns?.length ?? 0,
              countBySource: activeCountBySource,
              totalCount: activeTotalCount,
              search: activeSearch,
              setSearch: setActiveSearch,
              isLoading: isActiveLoading,
            }}
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
            stopRun={stopRun}
            isStoppingRun={isStoppingRun}
            realtime={realtime}
            setRealtime={setRealtime}
            sourceGroup={sourceGroup}
            setSourceGroup={setSourceGroup}
          />
        }
        secondPane={
          selectedRun ? (
            <RunPanel
              key={selectedRun.uuid}
              run={selectedRun}
              attachRun={attachRun}
              isAttachingRun={isAttachingRun}
              stopRun={stopRun}
              isStoppingRun={isStoppingRun}
              sourceGroup={debouncedSourceGroup}
            />
          ) : (
            <div className='w-full h-full flex flex-col gap-6 p-6 overflow-hidden relative'>
              <div className='w-full h-full flex items-center justify-center gap-2 py-9 px-6 border border-border border-dashed rounded-xl'>
                <Text.H5 color='foregroundMuted'>No run selected</Text.H5>
              </div>
            </div>
          )
        }
      />
    </div>
  )
}
