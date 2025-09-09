import { create } from 'zustand'
import { LatteInteraction } from '$/hooks/latte/types'
import { LatteUsage } from '@latitude-data/constants/latte'

type ProjectLatteState = {
  threadUuid: string | undefined
  jobId: string | undefined
  usage: LatteUsage | undefined
  latteActionsFeedbackUuid: string | undefined
  interactions: LatteInteraction[]
  newIntegrationIds: number[]
  isBrewing: boolean
  error: string | undefined
}

const EMPTY_PROJECT_STATE = {
  threadUuid: undefined,
  jobId: undefined,
  usage: undefined,
  latteActionsFeedbackUuid: undefined,
  interactions: [],
  newIntegrationIds: [], // TODO: refactor latte interactions to be stored in backend and have better step management
  isBrewing: false,
  error: undefined,
} satisfies ProjectLatteState

type LatteState = {
  // Project-scoped state
  projectStates: Record<number, ProjectLatteState>
  currentProjectId: number | undefined

  // Global state
  debugVersionUuid: string | undefined
  isLoadingUsage: boolean

  // Helper methods
  getCurrentProjectState: () => ProjectLatteState

  // Actions
  setCurrentProject: (projectId: number) => void
  setThreadUuid: (uuid: string | undefined) => void
  setIsBrewing: (loading: boolean) => void
  addInteractions: (interactions: LatteInteraction[]) => void
  addIntegrationId: (integrationId: number) => void
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

export const useLatteZustandStore = create<LatteState>((set, get) => ({
  // Initial state
  projectStates: {},
  currentProjectId: undefined,
  debugVersionUuid: undefined,
  isLoadingUsage: false,

  getCurrentProjectState: () => {
    const state = get()
    if (!state.currentProjectId) return EMPTY_PROJECT_STATE

    return state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE
  },

  // Actions
  setCurrentProject: (projectId: number) => {
    set((state) => {
      const newState = { ...state, currentProjectId: projectId }
      if (newState.projectStates[projectId]) return newState

      newState.projectStates[projectId] = EMPTY_PROJECT_STATE
      return newState
    })
  },

  setThreadUuid: (uuid: string | undefined) =>
    set((state) => {
      if (!state.currentProjectId) return state
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            threadUuid: uuid,
          },
        },
      }
    }),

  setIsBrewing: (loading: boolean) =>
    set((state) => {
      if (!state.currentProjectId) return state
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            isBrewing: loading,
          },
        },
      }
    }),

  addInteractions: (interactions: LatteInteraction[]) =>
    set((state) => {
      if (!state.currentProjectId) return state
      const currentState =
        state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...currentState,
            interactions: [...currentState.interactions, ...interactions],
          },
        },
      }
    }),

  setInteractions: (
    interactions:
      | LatteInteraction[]
      | ((prev: LatteInteraction[]) => LatteInteraction[]),
  ) =>
    set((state) => {
      if (!state.currentProjectId) return state

      const currentState =
        state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...currentState,
            interactions:
              typeof interactions === 'function'
                ? interactions(currentState.interactions)
                : interactions,
          },
        },
      }
    }),

  addInteraction: (interaction: LatteInteraction) =>
    set((state) => {
      if (!state.currentProjectId) return state

      const currentState =
        state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...currentState,
            interactions: [...currentState.interactions, interaction],
          },
        },
      }
    }),

  updateLastInteraction: (
    updater: (interaction: LatteInteraction) => LatteInteraction,
  ) =>
    set((state) => {
      if (!state.currentProjectId) return state

      const currentState =
        state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE

      if (currentState.interactions.length === 0) return state

      const lastIndex = currentState.interactions.length - 1
      const updatedInteractions = [...currentState.interactions]
      updatedInteractions[lastIndex] = updater(updatedInteractions[lastIndex]!)

      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...currentState,
            interactions: updatedInteractions,
          },
        },
      }
    }),

  addIntegrationId: (integrationId: number) =>
    set((state) => {
      if (!state.currentProjectId) return state
      const currentState =
        state.projectStates[state.currentProjectId] ?? EMPTY_PROJECT_STATE
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...currentState,
            newIntegrationIds: [
              ...currentState.newIntegrationIds,
              integrationId,
            ],
          },
        },
      }
    }),

  setError: (error: string | undefined) =>
    set((state) => {
      if (!state.currentProjectId) return state

      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            error,
          },
        },
      }
    }),

  setLatteActionsFeedbackUuid: (uuid: string | undefined) =>
    set((state) => {
      if (!state.currentProjectId) return state

      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            latteActionsFeedbackUuid: uuid,
          },
        },
      }
    }),

  setDebugVersionUuid: (uuid: string | undefined) =>
    set({ debugVersionUuid: uuid }),

  setUsage: (usage: LatteUsage | undefined) =>
    set((state) => {
      if (!state.currentProjectId) return state
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            usage,
          },
        },
      }
    }),

  setIsLoadingUsage: (loading: boolean) => set({ isLoadingUsage: loading }),

  setJobId: (jobId: string | undefined) =>
    set((state) => {
      if (!state.currentProjectId) return state
      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: {
            ...(state.projectStates[state.currentProjectId] ??
              EMPTY_PROJECT_STATE),
            jobId,
          },
        },
      }
    }),

  // Reset functions
  resetAll: () =>
    set((state) => {
      if (!state.currentProjectId) return state

      return {
        projectStates: {
          ...state.projectStates,
          [state.currentProjectId]: EMPTY_PROJECT_STATE,
        },
      }
    }),
}))
