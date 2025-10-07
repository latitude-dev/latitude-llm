'use client'

import { useCallback, useMemo } from 'react'
import { useLatteZustandStore } from './store'

export const useLatteStore = () => {
  const store = useLatteZustandStore()

  const setThreadUuid = useCallback(
    (uuid: string | undefined) => {
      store.setThreadUuid(uuid)
    },
    [store],
  )

  const setJobId = useCallback(
    (jobId: string | undefined) => {
      store.setJobId(jobId)
    },
    [store],
  )

  const resetAll = useCallback(() => {
    store.resetAll()
  }, [store])

  return useMemo(() => {
    const currentProjectState = store.getCurrentProjectState()

    return {
      // Global state
      debugVersionUuid: store.debugVersionUuid,
      isLoadingUsage: store.isLoadingUsage,

      // Current project state
      ...currentProjectState,

      // Store state
      currentProjectId: store.currentProjectId,

      // Actions
      setThreadUuid,
      setJobId,
      setCurrentProject: store.setCurrentProject,
      setIsBrewing: store.setIsBrewing,
      addInteractions: store.addInteractions,
      setInteractions: store.setInteractions,
      addInteraction: store.addInteraction,
      addIntegrationId: store.addIntegrationId,
      updateLastInteraction: store.updateLastInteraction,
      setError: store.setError,
      setLatteActionsFeedbackUuid: store.setLatteActionsFeedbackUuid,
      setDebugVersionUuid: store.setDebugVersionUuid,
      setUsage: store.setUsage,
      setIsLoadingUsage: store.setIsLoadingUsage,
      updateTodo: store.updateTodo,
      resetAll,
    }
  }, [store, setThreadUuid, setJobId, resetAll])
}
