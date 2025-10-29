'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useActiveRuns, useActiveRunsCount } from '$/stores/runs/activeRuns'
import {
  useCompletedRuns,
  useCompletedRunsCount,
} from '$/stores/runs/completedRuns'
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { RunPanel } from './RunPanel'
import { RunsList } from './RunsList'

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
  completed: { runs: CompletedRun[]; search: Pagination }
  limitedView?: Pick<ProjectLimitedView, 'totalRuns'>
  defaultSourceGroup: RunSourceGroup
}) {
  const { project } = useCurrentProject()

  const [sourceGroup, setSourceGroup] =
    useState<RunSourceGroup>(defaultSourceGroup)
  const [debouncedSourceGroup] = useDebounce(sourceGroup, 100)

  const {
    search: completedSearch,
    setSearch: setCompletedSearch,
    debouncedSearch: debouncedCompletedSearch,
  } = useSearchByGroup({
    defaultSearch: serverCompleted.search,
    sourceGroup,
  })

  const {
    search: activeSearch,
    setSearch: setActiveSearch,
    debouncedSearch: debouncedActiveSearch,
  } = useSearchByGroup({
    defaultSearch: serverActive.search,
    sourceGroup,
  })

  useEffect(() => {
    const currentUrl = window.location.origin + window.location.pathname

    const params = new URLSearchParams()
    if (debouncedActiveSearch.page) params.set('activePage', String(debouncedActiveSearch.page)) // prettier-ignore
    if (debouncedActiveSearch.pageSize) params.set('activePageSize', String(debouncedActiveSearch.pageSize)) // prettier-ignore
    if (debouncedCompletedSearch.page) params.set('completedPage', String(debouncedCompletedSearch.page)) // prettier-ignore
    if (debouncedCompletedSearch.pageSize) params.set('completedPageSize', String(debouncedCompletedSearch.pageSize)) // prettier-ignore
    if (debouncedSourceGroup) params.set('sourceGroup', String(debouncedSourceGroup)) // prettier-ignore
    const queryParams = params.toString()

    const targetUrl = `${currentUrl}${queryParams ? `?${queryParams}` : ''}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', targetUrl)
    }
  }, [debouncedActiveSearch, debouncedCompletedSearch, debouncedSourceGroup])

  const [realtime, setRealtime] = useState(!limitedView)

  const {
    data: activeRuns,
    attachRun,
    isAttachingRun,
    stopRun,
    isStoppingRun,
    isLoading: isActiveRunsLoading,
  } = useActiveRuns(
    { project, search: debouncedActiveSearch, realtime },
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

  const { data: activeCountBySource, isLoading: isActiveCountLoading } =
    useActiveRunsCount({ project, realtime })

  const activeTotalCount = useMemo(
    () => sumCounts(activeCountBySource, debouncedSourceGroup),
    [activeCountBySource, debouncedSourceGroup],
  )

  const isActiveLoading = isActiveRunsLoading || isActiveCountLoading

  const {
    data: completedRuns,
    mutate: mutateCompletedRuns,
    isLoading: isCompletedRunsLoading,
  } = useCompletedRuns(
    {
      project,
      search: {
        ...debouncedCompletedSearch,
        sourceGroup: debouncedSourceGroup,
      },
      realtime,
    },
    { fallbackData: serverCompleted.runs, keepPreviousData: true },
  )
  // Note: prefetch next results
  const { data: nextCompletedRuns } = useCompletedRuns({
    project,
    search: {
      ...debouncedCompletedSearch,
      page: (debouncedCompletedSearch.page ?? 1) + 1,
      sourceGroup: debouncedSourceGroup,
    },
    realtime: false,
  })

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
              next: nextCompletedRuns?.length ?? 0,
              countBySource: completedCountBySource,
              totalCount: completedTotalCount ?? limitedView?.totalRuns,
              search: completedSearch,
              setSearch: setCompletedSearch,
              isLoading: isCompletedLoading,
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
              mutateCompletedRuns={mutateCompletedRuns}
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
