'use client'

import { useCallback, useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { CompletedRun, RunSourceGroup } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { API_ROUTES } from '$/services/routes/api'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { create } from 'zustand'

export interface CompletedRunsKeysetPaginationResult {
  items: CompletedRun[]
  next: string | null
}

type ProjectPaginationState = {
  cursorHistory: (string | null)[]
  currentCursor: string | null
}

const EMPTY_STATE: ProjectPaginationState = {
  cursorHistory: [],
  currentCursor: null,
}

type CompletedRunsPaginationState = {
  projectStates: Record<number, ProjectPaginationState>

  getProjectState: (projectId: number) => ProjectPaginationState
  setCurrentCursor: (projectId: number, cursor: string | null) => void
  pushCursorToHistory: (projectId: number, cursor: string | null) => void
  popCursorFromHistory: (projectId: number) => string | null
  reset: (projectId: number) => void
}

const useCompletedRunsPaginationZustand = create<CompletedRunsPaginationState>(
  (set, get) => ({
    projectStates: {},

    getProjectState: (projectId: number) => {
      return get().projectStates[projectId] ?? EMPTY_STATE
    },

    setCurrentCursor: (projectId: number, cursor: string | null) =>
      set((state) => ({
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...(state.projectStates[projectId] ?? EMPTY_STATE),
            currentCursor: cursor,
          },
        },
      })),

    pushCursorToHistory: (projectId: number, cursor: string | null) =>
      set((state) => {
        const currentState = state.projectStates[projectId] ?? EMPTY_STATE
        return {
          projectStates: {
            ...state.projectStates,
            [projectId]: {
              ...currentState,
              cursorHistory: [...currentState.cursorHistory, cursor],
            },
          },
        }
      }),

    popCursorFromHistory: (projectId: number) => {
      const state = get()
      const currentState = state.projectStates[projectId] ?? EMPTY_STATE
      if (currentState.cursorHistory.length === 0) return null

      const previousCursor =
        currentState.cursorHistory[currentState.cursorHistory.length - 1]
      set({
        projectStates: {
          ...state.projectStates,
          [projectId]: {
            ...currentState,
            cursorHistory: currentState.cursorHistory.slice(0, -1),
          },
        },
      })
      return previousCursor
    },

    reset: (projectId: number) =>
      set((state) => ({
        projectStates: {
          ...state.projectStates,
          [projectId]: EMPTY_STATE,
        },
      })),
  }),
)

export function useCompletedRunsKeysetPaginationStore(
  {
    projectId,
    initialItems = [],
    limit = DEFAULT_PAGINATION_SIZE,
    sourceGroup,
  }: {
    projectId: number
    initialItems?: CompletedRun[]
    limit?: number
    sourceGroup?: RunSourceGroup
  },
  opts?: SWRConfiguration,
) {
  const {
    getProjectState,
    setCurrentCursor,
    pushCursorToHistory,
    popCursorFromHistory,
    reset: resetZustand,
  } = useCompletedRunsPaginationZustand()

  const { cursorHistory, currentCursor } = getProjectState(projectId)

  const apiUrl = API_ROUTES.projects.detail(projectId).runs.completed.root

  const fetcher = useFetcher<
    CompletedRunsKeysetPaginationResult,
    CompletedRunsKeysetPaginationResult
  >(apiUrl, {
    serializer: ({ items, ...rest }) => ({
      items: serializeRuns(items),
      ...rest,
    }),
    searchParams: compactObject({
      from: currentCursor ?? undefined,
      limit: limit.toString(),
      sourceGroup: sourceGroup ?? undefined,
    }) as Record<string, string>,
  })

  const { data, error, isLoading, mutate } =
    useSWR<CompletedRunsKeysetPaginationResult>(
      [
        'completedRunsKeysetPagination',
        projectId,
        currentCursor,
        limit,
        sourceGroup,
      ],
      fetcher,
      {
        ...opts,
        keepPreviousData: true,
        fallbackData:
          initialItems.length > 0
            ? {
                items: initialItems,
                next:
                  initialItems.length > 0
                    ? JSON.stringify({
                        startedAt: initialItems.at(-1)!.startedAt.toISOString(),
                        id: initialItems.at(-1)!.span.id,
                      })
                    : null,
              }
            : undefined,
      },
    )

  const goToNextPage = useCallback(() => {
    if (!data?.next || isLoading) return

    pushCursorToHistory(projectId, currentCursor)
    setCurrentCursor(projectId, data.next)
  }, [
    data?.next,
    isLoading,
    currentCursor,
    projectId,
    pushCursorToHistory,
    setCurrentCursor,
  ])

  const goToPrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || isLoading) return

    const previousCursor = popCursorFromHistory(projectId)
    setCurrentCursor(projectId, previousCursor)
  }, [
    cursorHistory.length,
    isLoading,
    projectId,
    popCursorFromHistory,
    setCurrentCursor,
  ])

  const reset = useCallback(() => {
    resetZustand(projectId)
  }, [projectId, resetZustand])

  return useMemo(
    () => ({
      items: data?.items ?? [],
      hasNext: !!data?.next,
      hasPrev: cursorHistory.length > 0, // Can go back if we have history
      mutate,
      isLoading,
      error,
      goToNextPage,
      goToPrevPage,
      reset,
      // Expose current state for debugging if needed
      currentCursor,
      cursorHistoryLength: cursorHistory.length,
    }),
    [
      data?.items,
      data?.next,
      cursorHistory.length,
      isLoading,
      error,
      goToNextPage,
      goToPrevPage,
      mutate,
      reset,
      currentCursor,
    ],
  )
}

function serializeRuns(runs: CompletedRun[]): CompletedRun[] {
  return runs.map((run) => ({
    ...run,
    queuedAt: new Date(run.queuedAt),
    startedAt: new Date(run.startedAt),
    endedAt: new Date(run.endedAt!),
    span: {
      ...run.span,
      startedAt: new Date(run.span.startedAt),
      endedAt: new Date(run.span.endedAt!),
    },
  })) as CompletedRun[]
}
