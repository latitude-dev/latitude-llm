import { RealtimeToggle } from '$/components/RealtimeToggle'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import {
  ActiveRun,
  CompletedRun,
  LogSources,
  RunSourceGroup,
} from '@latitude-data/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { ProjectLimitedView } from '@latitude-data/core/schema/models/types/Project'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RunsListItem } from './Item'
import { RunSourceSelector } from './SourceSelector'

type ActiveRunsProps = {
  runs: ActiveRun[]
  search: Pagination
  setSearch: (search: Pagination) => void
  next: number
  isLoading?: boolean
  countBySource?: Record<LogSources, number>
  totalCount?: number
}

type CompletedRunsProps = {
  runs: CompletedRun[]
  goToNextPage: () => void
  goToPrevPage: () => void
  hasNext: boolean
  hasPrev: boolean
  isLoading?: boolean
  countBySource?: Record<LogSources, number>
  totalCount?: number
  limitedView?: Pick<ProjectLimitedView, 'totalRuns'>
}

export function RunsList({
  active,
  completed,
  selectedRunUuid,
  setSelectedRunUuid,
  stopRun,
  isStoppingRun,
  realtime,
  setRealtime,
  sourceGroup,
  setSourceGroup,
}: {
  active: ActiveRunsProps
  completed: CompletedRunsProps
  selectedRunUuid?: string
  setSelectedRunUuid: (uuid?: string) => void
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: boolean
  realtime: boolean
  setRealtime: (realtime: boolean) => void
  sourceGroup: RunSourceGroup
  setSourceGroup: (sourceGroup: RunSourceGroup) => void
}) {
  const timerRef = useRef<number | null>(null)
  const [timerNow, setTimerNow] = useState<number>(0)

  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = window.setInterval(() => {
      setTimerNow(Date.now())
    }, 1000)
  }, [setTimerNow])

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
    }
    timerRef.current = null
    setTimerNow(0)
  }, [setTimerNow])

  // Note: cleaning up timer on unmount
  useEffect(() => resetTimer, [resetTimer])
  useEffect(() => {
    if (active.runs.length > 0) startTimer()
    else resetTimer()
  }, [active.runs.length, startTimer, resetTimer])

  return (
    <div className='w-full h-full flex flex-col gap-6 p-6 overflow-hidden relative'>
      <div className='w-full min-h-0 flex flex-col justify-start items-start gap-4 overflow-hidden'>
        <div className='w-full flex justify-between items-center gap-2'>
          <div className='flex flex-col gap-1'>
            <Text.H4M>In progress</Text.H4M>
            <Text.H6 color='foregroundMuted'>Runs currently processing</Text.H6>
          </div>
          <div className='flex flex-row items-center gap-4'>
            <RunSourceSelector
              value={sourceGroup}
              setValue={setSourceGroup}
              countBySource={active.countBySource}
            />
            <RealtimeToggle enabled={realtime} setEnabled={setRealtime} />
          </div>
        </div>
        {active.runs.length > 0 ? (
          <div className='w-full min-h-0 flex flex-col border border-border rounded-xl overflow-hidden'>
            <div className='w-full flex flex-col divide-border divide-y rounded-t-xl overflow-hidden overflow-y-auto custom-scrollbar relative'>
              {active.runs.map((run) => (
                <RunsListItem
                  key={run.uuid}
                  run={run}
                  isSelected={selectedRunUuid === run.uuid}
                  setSelectedRunUuid={setSelectedRunUuid}
                  timerNow={timerNow}
                  stopRun={stopRun}
                  isStoppingRun={isStoppingRun}
                />
              ))}
            </div>
            {((active.search.page ?? 0) > 1 || active.next > 0) && (
              <div className='w-full h-12 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-1 py-1'>
                <LogicTablePaginationFooter
                  page={active.search.page ?? 1}
                  pageSize={active.search.pageSize ?? 25}
                  count={active.totalCount ?? 0}
                  countLabel={(count) => `${count} runs`}
                  onPageChange={(page) =>
                    active.setSearch({ ...active.search, page })
                  }
                  isLoading={active.isLoading}
                />
              </div>
            )}
          </div>
        ) : (
          <div className='w-full flex items-center justify-center gap-2 py-9 px-4 border border-border border-dashed rounded-xl'>
            <Text.H5 color='foregroundMuted'>No active runs found</Text.H5>
          </div>
        )}
      </div>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-4 overflow-hidden'>
        <div className='w-full flex justify-between items-center gap-2'>
          <div className='flex flex-col gap-1'>
            <Text.H4M>Completed</Text.H4M>
            <Text.H6 color='foregroundMuted'>Runs already finished</Text.H6>
          </div>
        </div>
        {completed.runs.length > 0 ? (
          <div className='w-full min-h-0 flex flex-col border border-border rounded-xl overflow-hidden'>
            <div className='w-full flex flex-col divide-border divide-y rounded-t-xl overflow-hidden overflow-y-auto custom-scrollbar relative'>
              {completed.runs.map((run) => (
                <RunsListItem
                  key={run.uuid}
                  run={run}
                  isSelected={selectedRunUuid === run.uuid}
                  setSelectedRunUuid={setSelectedRunUuid}
                />
              ))}
            </div>
            {(completed.hasNext || completed.hasPrev) && (
              <div className='w-full h-12 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-1 py-1'>
                <SimpleKeysetTablePaginationFooter
                  setNext={completed.goToNextPage}
                  setPrev={completed.goToPrevPage}
                  hasNext={completed.hasNext}
                  hasPrev={completed.hasPrev}
                  count={
                    completed.totalCount ??
                    completed.limitedView?.totalRuns ??
                    null
                  }
                  countLabel={(count) => `${count} runs`}
                  isLoading={completed.isLoading}
                />
              </div>
            )}
          </div>
        ) : (
          <div className='w-full h-full flex items-center justify-center gap-2 py-9 px-4 border border-border border-dashed rounded-xl'>
            <Text.H5 color='foregroundMuted'>No completed runs found</Text.H5>
          </div>
        )}
      </div>
    </div>
  )
}
