'use client'

import { RealtimeToggle } from '$/components/RealtimeToggle'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import {
  ActiveRun,
  CompletedRun,
  Pagination,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RunsListItem } from './Item'

export function RunsList({
  active,
  completed,
  selectedRunUuid,
  setSelectedRunUuid,
  stopRun,
  isStoppingRun,
  realtime,
  setRealtime,
}: {
  active: {
    runs: ActiveRun[]
    search: Pagination
    setSearch: (search: Pagination) => void
    next: number
  }
  completed: {
    runs: CompletedRun[]
    search: Pagination
    setSearch: (search: Pagination) => void
    next: number
  }
  selectedRunUuid?: string
  setSelectedRunUuid: (uuid?: string) => void
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: boolean
  realtime: boolean
  setRealtime: (realtime: boolean) => void
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
          <RealtimeToggle enabled={realtime} setEnabled={setRealtime} />
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
              <div className='w-full h-10 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-2 py-1'>
                <LimitedTablePaginationFooter
                  optimistic={true}
                  count={active.runs.length + active.next}
                  countLabel={(count) => `${count} runs`}
                  page={active.search.page ?? 1}
                  nextPage={active.next > 1}
                  onPageChange={(page) =>
                    active.setSearch({ ...active.search, page })
                  }
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
            {((completed.search.page ?? 0) > 1 || completed.next > 0) && (
              <div className='w-full h-10 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-2 py-1'>
                <LimitedTablePaginationFooter
                  optimistic={true}
                  count={completed.runs.length + completed.next}
                  countLabel={(count) => `${count} runs`}
                  page={completed.search.page ?? 1}
                  nextPage={completed.next > 1}
                  onPageChange={(page) =>
                    completed.setSearch({ ...completed.search, page })
                  }
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
