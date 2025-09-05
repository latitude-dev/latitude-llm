'use client'

import { useCallback, useMemo } from 'react'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useLatteZustandStore } from './store'
import { useCurrentProject } from '@latitude-data/web-ui/providers'

type StoredLatteData = { jobId?: string; threadUuid?: string }
type StoredLatteDataKeys = keyof StoredLatteData
export type StoredLatteDataByProject = Record<number, StoredLatteData>

export const useLatteStore = () => {
  const { project } = useCurrentProject()
  const projectId = project.id
  const { setValue: setStoredLatteData } =
    useLocalStorage<StoredLatteDataByProject>({
      key: AppLocalStorage.latteThread,
      defaultValue: {},
    })
  const store = useLatteZustandStore()

  const addOrRemoveValue = useCallback(
    (key: StoredLatteDataKeys, value: string | undefined) => {
      setStoredLatteData((prev) => {
        if (value) {
          return {
            ...prev,
            [projectId]: {
              ...prev[projectId],
              [key]: value,
            },
          }
        } else {
          const { [projectId]: projectData, ...rest } = prev
          if (projectData) {
            const { [key]: _, ...restProjectData } = projectData
            return {
              ...rest,
              ...(Object.keys(restProjectData).length > 0
                ? { [projectId]: restProjectData }
                : {}),
            }
          }
          return rest
        }
      })
    },
    [setStoredLatteData, projectId],
  )

  const saveInLocalStorage = useCallback(
    (key: StoredLatteDataKeys, value: string | undefined) => {
      setStoredLatteData((prev) => {
        if (value) {
          return {
            ...prev,
            [projectId]: {
              ...prev[projectId],
              [key]: value,
            },
          }
        } else {
          const { [projectId]: projectData, ...rest } = prev
          if (projectData) {
            const { [key]: _, ...restProjectData } = projectData
            return {
              ...rest,
              ...(Object.keys(restProjectData).length > 0
                ? { [projectId]: restProjectData }
                : {}),
            }
          }
          return rest
        }
      })
    },
    [setStoredLatteData, projectId],
  )

  const setThreadUuid = useCallback(
    (uuid: string | undefined) => {
      store.setThreadUuid(uuid)
      addOrRemoveValue('threadUuid', uuid)
      saveInLocalStorage('threadUuid', uuid)
    },
    [store, addOrRemoveValue, saveInLocalStorage],
  )

  const setJobId = useCallback(
    (jobId: string | undefined) => {
      store.setJobId(jobId)
      addOrRemoveValue('jobId', jobId)
      saveInLocalStorage('jobId', jobId)
    },
    [store, addOrRemoveValue, saveInLocalStorage],
  )

  const resetAll = useCallback(() => {
    store.resetAll()
    setStoredLatteData((prev) => {
      const { [projectId]: _, ...rest } = prev
      return rest
    })
  }, [store, setStoredLatteData, projectId])

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
      updateLastInteraction: store.updateLastInteraction,
      setError: store.setError,
      setLatteActionsFeedbackUuid: store.setLatteActionsFeedbackUuid,
      setDebugVersionUuid: store.setDebugVersionUuid,
      setUsage: store.setUsage,
      setIsLoadingUsage: store.setIsLoadingUsage,
      resetAll,
    }
  }, [store, setThreadUuid, setJobId, resetAll])
}
