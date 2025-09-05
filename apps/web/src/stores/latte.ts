'use client'

import { LatteInteraction } from '$/hooks/latte/types'
import { LatteUsage } from '@latitude-data/constants/latte'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'

interface LatteState {
  // Chat state
  isBrewing: boolean
  interactions: LatteInteraction[]
  error: string | undefined
  threadUuid: string | undefined

  latteActionsFeedbackUuid: string | undefined

  // Debug state
  debugVersionUuid: string | undefined

  // Usage state
  usage: LatteUsage | undefined
  isLoadingUsage: boolean

  // BullMQ job ID to stop lattes job
  jobId: string | undefined

  // Actions
  setThreadUuid: (uuid: string | undefined) => void
  setIsBrewing: (loading: boolean) => void
  addInteractions: (interactions: LatteInteraction[]) => void
  setInteractions: (
    interactions:
      | LatteInteraction[]
      | ((prev: LatteInteraction[]) => LatteInteraction[]),
  ) => void
  addInteraction: (interaction: LatteInteraction) => void
  updateLastInteraction: (
    updater: (interaction: LatteInteraction) => LatteInteraction,
  ) => void
  setError: (error: string | undefined) => void
  setLatteActionsFeedbackUuid: (uuid: string | undefined) => void
  setDebugVersionUuid: (uuid: string | undefined) => void
  setUsage: (usage: LatteUsage | undefined) => void
  setIsLoadingUsage: (loading: boolean) => void
  setJobId: (jobId: string | undefined) => void

  // Reset functions
  resetAll: () => void
}

const useStore = create<LatteState>((set) => ({
  // Initial state
  isBrewing: false,
  interactions: [],
  error: undefined,
  latteActionsFeedbackUuid: undefined,
  threadUuid: undefined,
  debugVersionUuid: undefined,
  usage: undefined,
  isLoadingUsage: false,
  jobId: undefined,

  // Chat actions
  setIsBrewing: (loading: boolean) => set({ isBrewing: loading }),
  setThreadUuid: (uuid: string | undefined) => set({ threadUuid: uuid }),
  addInteractions: (interactions: LatteInteraction[]) =>
    set((state) => ({
      interactions: [...state.interactions, ...interactions],
    })),

  setInteractions: (
    interactions:
      | LatteInteraction[]
      | ((prev: LatteInteraction[]) => LatteInteraction[]),
  ) =>
    set((state) => ({
      interactions:
        typeof interactions === 'function'
          ? interactions(state.interactions)
          : interactions,
    })),

  addInteraction: (interaction: LatteInteraction) =>
    set((state) => ({
      interactions: [...state.interactions, interaction],
    })),

  updateLastInteraction: (
    updater: (interaction: LatteInteraction) => LatteInteraction,
  ) =>
    set((state) => {
      if (state.interactions.length === 0) return state

      const lastIndex = state.interactions.length - 1
      const updatedInteractions = [...state.interactions]
      updatedInteractions[lastIndex] = updater(updatedInteractions[lastIndex]!)

      return { interactions: updatedInteractions }
    }),

  setError: (error: string | undefined) => set({ error }),

  setLatteActionsFeedbackUuid: (uuid: string | undefined) =>
    set({ latteActionsFeedbackUuid: uuid }),

  setDebugVersionUuid: (uuid: string | undefined) =>
    set({ debugVersionUuid: uuid }),

  setUsage: (usage: LatteUsage | undefined) => set({ usage }),
  setIsLoadingUsage: (loading: boolean) => set({ isLoadingUsage: loading }),

  setJobId: (jobId: string | undefined) => set({ jobId: jobId }),

  // Reset functions
  resetAll: () =>
    set({
      latteActionsFeedbackUuid: undefined,
      threadUuid: undefined,
      jobId: undefined,
      interactions: [],
      isBrewing: false,
      error: undefined,
    }),
}))

export const useLatteStore = () => {
  const store = useStore()
  const { setValue: setStoredThreadUuid } = useLocalStorage<string | undefined>(
    {
      key: AppLocalStorage.latteThreadUuid,
      defaultValue: undefined,
    },
  )
  const { setValue: setStoredJobId } = useLocalStorage<string | undefined>({
    key: AppLocalStorage.latteJobId,
    defaultValue: undefined,
  })

  const setThreadUuid = useCallback(
    (uuid: string | undefined) => {
      store.setThreadUuid(uuid)
      setStoredThreadUuid(uuid)
    },
    [store, setStoredThreadUuid],
  )

  const setJobId = useCallback(
    (jobId: string | undefined) => {
      store.setJobId(jobId)
      setStoredJobId(jobId)
    },
    [store, setStoredJobId],
  )

  const resetAll = useCallback(() => {
    store.resetAll()
    setStoredThreadUuid(undefined)
    setStoredJobId(undefined)
  }, [store, setStoredThreadUuid, setStoredJobId])

  return useMemo(
    () => ({
      ...store,
      setThreadUuid,
      setJobId,
      resetAll,
    }),
    [store, setThreadUuid, setJobId, resetAll],
  )
}
