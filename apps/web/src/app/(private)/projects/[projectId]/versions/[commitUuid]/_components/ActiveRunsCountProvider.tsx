'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useActiveRunsCount } from '$/stores/runs/activeRuns'
import { LogSources } from '@latitude-data/constants'
import { createContext, ReactNode, useMemo } from 'react'

type IActiveRunsCountContextType = {
  data: Record<LogSources, number> | undefined
  isLoading: boolean
  limitedView: boolean
}

export const ActiveRunsCountContext =
  createContext<IActiveRunsCountContextType>({} as IActiveRunsCountContextType)

export function ActiveRunsCountProvider({
  children,
  limitedView = false,
}: {
  children: ReactNode
  limitedView?: boolean
}) {
  const { project } = useCurrentProject()
  const { data, isLoading } = useActiveRunsCount({
    project,
    realtime: !limitedView,
  })

  const value = useMemo(
    () => ({
      data,
      isLoading,
      limitedView,
    }),
    [data, isLoading, limitedView],
  )

  return (
    <ActiveRunsCountContext.Provider value={value}>
      {children}
    </ActiveRunsCountContext.Provider>
  )
}
