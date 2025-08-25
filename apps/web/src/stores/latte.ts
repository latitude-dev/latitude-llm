'use client'

import { LatteInteraction } from '$/hooks/latte/types'
import { LatteChange, LatteUsage } from '@latitude-data/constants/latte'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'

interface LatteState {
  // Chat state
  isLoading: boolean
  interactions: LatteInteraction[]
  error: string | undefined
  threadUuid: string | undefined

  // Changes state
  changes: LatteChange[]
  latteActionsFeedbackUuid: string | undefined

  // Debug state
  debugVersionUuid: string | undefined

  // Usage state
  usage: LatteUsage | undefined
  isLoadingUsage: boolean

  // Actions
  setThreadUuid: (uuid: string | undefined) => void
  setIsLoading: (loading: boolean) => void
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
  setChanges: (
    changes: LatteChange[] | ((prev: LatteChange[]) => LatteChange[]),
  ) => void
  addChange: (change: LatteChange) => void
  updateChange: (
    draftUuid: string,
    documentUuid: string,
    updater: (change: LatteChange) => LatteChange,
  ) => void
  removeChange: (draftUuid: string, documentUuid: string) => void
  setLatteActionsFeedbackUuid: (uuid: string | undefined) => void
  setDebugVersionUuid: (uuid: string | undefined) => void
  setUsage: (usage: LatteUsage | undefined) => void
  setIsLoadingUsage: (loading: boolean) => void

  // Reset functions
  resetChat: () => void
  resetChanges: () => void
  resetAll: () => void
}

const useStore = create<LatteState>((set) => ({
  // Initial state
  isLoading: false,
  interactions: [],
  error: undefined,
  changes: [],
  latteActionsFeedbackUuid: undefined,
  threadUuid: undefined,
  debugVersionUuid: undefined,
  usage: undefined,
  isLoadingUsage: false,

  // Chat actions
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
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

  // Changes actions
  setChanges: (
    changes: LatteChange[] | ((prev: LatteChange[]) => LatteChange[]),
  ) =>
    set((state) => ({
      changes: typeof changes === 'function' ? changes(state.changes) : changes,
    })),

  addChange: (change: LatteChange) =>
    set((state) => ({
      changes: [...state.changes, change],
    })),

  updateChange: (
    draftUuid: string,
    documentUuid: string,
    updater: (change: LatteChange) => LatteChange,
  ) =>
    set((state) => {
      const index = state.changes.findIndex(
        (change) =>
          change.draftUuid === draftUuid &&
          change.current.documentUuid === documentUuid,
      )

      if (index === -1) return state

      const updatedChanges = [...state.changes]
      updatedChanges[index] = updater(updatedChanges[index]!)

      return { changes: updatedChanges }
    }),

  removeChange: (draftUuid: string, documentUuid: string) =>
    set((state) => ({
      changes: state.changes.filter(
        (change) =>
          !(
            change.draftUuid === draftUuid &&
            change.current.documentUuid === documentUuid
          ),
      ),
    })),

  setLatteActionsFeedbackUuid: (uuid: string | undefined) =>
    set({ latteActionsFeedbackUuid: uuid }),

  setDebugVersionUuid: (uuid: string | undefined) =>
    set({ debugVersionUuid: uuid }),

  setUsage: (usage: LatteUsage | undefined) => set({ usage }),
  setIsLoadingUsage: (loading: boolean) => set({ isLoadingUsage: loading }),

  // Reset functions
  resetChat: () =>
    set({
      isLoading: false,
      interactions: [],
      error: undefined,
      threadUuid: undefined,
    }),

  resetChanges: () =>
    set({
      changes: [],
      latteActionsFeedbackUuid: undefined,
    }),

  resetAll: () =>
    set({
      isLoading: false,
      interactions: [],
      error: undefined,
      changes: [],
      latteActionsFeedbackUuid: undefined,
      threadUuid: undefined,
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

  const setThreadUuid = useCallback(
    (uuid: string | undefined) => {
      store.setThreadUuid(uuid)
      setStoredThreadUuid(uuid)
    },
    [store, setStoredThreadUuid],
  )
  const resetChat = useCallback(() => {
    store.resetChat()
    setStoredThreadUuid(undefined)
  }, [store, setStoredThreadUuid])

  return useMemo(
    () => ({
      ...store,
      setThreadUuid,
      resetChat,
    }),
    [store, setThreadUuid, resetChat],
  )
}
