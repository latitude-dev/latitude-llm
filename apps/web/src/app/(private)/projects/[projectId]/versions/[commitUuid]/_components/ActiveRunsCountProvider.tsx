'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useActiveRunsCount } from '$/stores/runs/activeRuns'
import { LogSources } from '@latitude-data/constants'
import { createContext, ReactNode, useContext, useMemo } from 'react'

type IActiveRunsCountContextType = {
  data: Record<LogSources, number> | undefined
  isLoading: boolean
  limitedView: boolean
}

const ActiveRunsCountContext = createContext<IActiveRunsCountContextType>(
  {} as IActiveRunsCountContextType,
)

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

export function useActiveRunsCountContext() {
  const context = useContext(ActiveRunsCountContext)

  if (!context) {
    throw new Error(
      'useActiveRunsCountContext must be used within an ActiveRunsCountProvider',
    )
  }

  return context
}
