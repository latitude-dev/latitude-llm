'use client'

import { useActiveRuns, useActiveRunsCount } from '$/stores/runs/activeRuns'
import {
  useCompletedRuns,
  useCompletedRunsCount,
} from '$/stores/runs/completedRuns'
import { ProjectLimitedView } from '@latitude-data/core/schema/types'
import { ActiveRun, CompletedRun } from '@latitude-data/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { RunPanel } from './RunPanel'
import { RunsList } from './RunsList'

export function RunsPage({
  active: serverActive,
  completed: serverCompleted,
  limitedView,
}: {
  active: { runs: ActiveRun[]; search: Pagination }
  completed: { runs: CompletedRun[]; search: Pagination }
  limitedView?: Pick<ProjectLimitedView, 'totalRuns'>
}) {
  const { project } = useCurrentProject()

  const [activeSearch, setActiveSearch] = useState(serverActive.search)
  const [debouncedActiveSearch] = useDebounce(activeSearch, 100)

  const [completedSearch, setCompletedSearch] = useState(serverCompleted.search)
  const [debouncedCompletedSearch] = useDebounce(completedSearch, 100)

  useEffect(() => {
    const currentUrl = window.location.origin + window.location.pathname

    const params = new URLSearchParams()
    if (debouncedActiveSearch.page) params.set('activePage', String(debouncedActiveSearch.page)) // prettier-ignore
    if (debouncedActiveSearch.pageSize) params.set('activePageSize', String(debouncedActiveSearch.pageSize)) // prettier-ignore
    if (debouncedCompletedSearch.page) params.set('completedPage', String(debouncedCompletedSearch.page)) // prettier-ignore
    if (debouncedCompletedSearch.pageSize) params.set('completedPageSize', String(debouncedCompletedSearch.pageSize)) // prettier-ignore
    const queryParams = params.toString()

    const targetUrl = `${currentUrl}${queryParams ? `?${queryParams}` : ''}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', targetUrl)
    }
  }, [debouncedActiveSearch, debouncedCompletedSearch])

  const [realtime, setRealtime] = useState(!limitedView)

  const {
    data: activeRuns,
    attachRun,
    isAttachingRun,
    stopRun,
    isStoppingRun,
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
    },
    realtime: false,
  })

  const { data: activeCount, isLoading: isActiveCountLoading } =
    useActiveRunsCount({ project, realtime })

  const isActiveLoading = isActiveCountLoading

  const { data: completedRuns } = useCompletedRuns(
    { project, search: debouncedCompletedSearch, realtime },
    { fallbackData: serverCompleted.runs, keepPreviousData: true },
  )
  // Note: prefetch next results
  const { data: nextCompletedRuns } = useCompletedRuns({
    project,
    search: {
      ...debouncedCompletedSearch,
      page: (debouncedCompletedSearch.page ?? 1) + 1,
    },
    realtime: false,
  })

  const { data: completedCount, isLoading: isCompletedCountLoading } =
    useCompletedRunsCount({ project, realtime, disable: !!limitedView })

  const isCompletedLoading = isCompletedCountLoading

  // Note: searching the run this way to allow for real time updates
  const [selectedRunUuid, setSelectedRunUuid] = useState<string>()
  const selectedRun = useMemo(() => {
    return (
      activeRuns.find((run) => run.uuid === selectedRunUuid) ||
      completedRuns.find((run) => run.uuid === selectedRunUuid)
    )
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
              count: activeCount ?? 0,
              search: activeSearch,
              setSearch: setActiveSearch,
              isLoading: isActiveLoading,
            }}
            completed={{
              runs: completedRuns,
              next: nextCompletedRuns?.length ?? 0,
              count: completedCount ?? limitedView?.totalRuns ?? 0,
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
