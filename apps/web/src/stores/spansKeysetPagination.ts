'use client'

import { useCallback, useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { Span, SpanType } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { API_ROUTES } from '$/services/routes/api'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { useSearchParams } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'
import { create } from 'zustand'

export interface SpansKeysetPaginationResult {
  items: Span[]
  count: number | null
  next: string | null
}

type SpansPaginationState = {
  cursorHistory: (string | null)[]
  currentCursor: string | null
}

const EMPTY_STATE: SpansPaginationState = {
  cursorHistory: [],
  currentCursor: null,
}

type SpansKeysetPaginationZustandState = {
  states: Record<string, SpansPaginationState>

  getState: (key: string) => SpansPaginationState
  setCurrentCursor: (key: string, cursor: string | null) => void
  pushCursorToHistory: (key: string, cursor: string | null) => void
  popCursorFromHistory: (key: string) => string | null
  reset: (key: string) => void
}

function getStateKey(
  projectId: string,
  commitUuid: string,
  documentUuid: string,
  type: SpanType,
): string {
  return `${projectId}:${commitUuid}:${documentUuid}:${type}`
}

const useSpansKeysetPaginationZustand =
  create<SpansKeysetPaginationZustandState>((set, get) => ({
    states: {},

    getState: (key: string) => {
      return get().states[key] ?? EMPTY_STATE
    },

    setCurrentCursor: (key: string, cursor: string | null) =>
      set((state) => ({
        states: {
          ...state.states,
          [key]: {
            ...(state.states[key] ?? EMPTY_STATE),
            currentCursor: cursor,
          },
        },
      })),

    pushCursorToHistory: (key: string, cursor: string | null) =>
      set((state) => {
        const currentState = state.states[key] ?? EMPTY_STATE
        return {
          states: {
            ...state.states,
            [key]: {
              ...currentState,
              cursorHistory: [...currentState.cursorHistory, cursor],
            },
          },
        }
      }),

    popCursorFromHistory: (key: string) => {
      const state = get()
      const currentState = state.states[key] ?? EMPTY_STATE
      if (currentState.cursorHistory.length === 0) return null

      const previousCursor =
        currentState.cursorHistory[currentState.cursorHistory.length - 1]
      set({
        states: {
          ...state.states,
          [key]: {
            ...currentState,
            cursorHistory: currentState.cursorHistory.slice(0, -1),
          },
        },
      })
      return previousCursor
    },

    reset: (key: string) =>
      set((state) => ({
        states: {
          ...state.states,
          [key]: EMPTY_STATE,
        },
      })),
  }))

export function useSpansKeysetPaginationStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    type = SpanType.Prompt,
    initialItems = [],
    limit = DEFAULT_PAGINATION_SIZE,
  }: {
    projectId: string
    commitUuid: string
    documentUuid: string
    type?: SpanType
    initialItems?: Span[]
    limit?: number
  },
  opts?: SWRConfiguration,
) {
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const filters = parseSpansFilters(filtersParam, 'spansKeysetPagination')

  const {
    getState,
    setCurrentCursor,
    pushCursorToHistory,
    popCursorFromHistory,
    reset: resetZustand,
  } = useSpansKeysetPaginationZustand()

  const stateKey = getStateKey(projectId, commitUuid, documentUuid, type)
  const { cursorHistory, currentCursor } = getState(stateKey)

  const apiUrl = API_ROUTES.projects
    .detail(parseInt(projectId))
    .commits.detail(commitUuid)
    .documents.detail(documentUuid).spans.limited

  const fetcher = useFetcher<
    SpansKeysetPaginationResult,
    SpansKeysetPaginationResult
  >(apiUrl, {
    serializer: ({ items, ...rest }) => ({
      items: serializeSpans(items),
      ...rest,
    }),
    searchParams: compactObject({
      from: currentCursor ?? undefined,
      type,
      limit: limit.toString(),
      filters: filters ? JSON.stringify(filters) : undefined,
    }) as Record<string, string>,
  })

  const { data, error, isLoading } = useSWR<SpansKeysetPaginationResult>(
    [
      'spansKeysetPagination',
      projectId,
      commitUuid,
      documentUuid,
      currentCursor,
      type,
      limit,
      filters,
    ],
    fetcher,
    {
      ...opts,
      keepPreviousData: true,
      fallbackData:
        initialItems.length > 0
          ? {
              count: null,
              items: initialItems,
              next: initialItems.at(-1)!.startedAt.toISOString(),
            }
          : undefined,
    },
  )

  const goToNextPage = useCallback(() => {
    if (!data?.next || isLoading) return

    pushCursorToHistory(stateKey, currentCursor)
    setCurrentCursor(stateKey, data.next)
  }, [
    data?.next,
    isLoading,
    currentCursor,
    stateKey,
    pushCursorToHistory,
    setCurrentCursor,
  ])

  const goToPrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || isLoading) return

    const previousCursor = popCursorFromHistory(stateKey)
    if (previousCursor !== null) {
      setCurrentCursor(stateKey, previousCursor)
    }
  }, [
    cursorHistory.length,
    isLoading,
    stateKey,
    popCursorFromHistory,
    setCurrentCursor,
  ])

  const reset = useCallback(() => {
    resetZustand(stateKey)
  }, [stateKey, resetZustand])

  return useMemo(
    () => ({
      items: data?.items ?? [],
      count: data?.count ?? null,
      hasNext: !!data?.next,
      hasPrev: cursorHistory.length > 0, // Can go back if we have history
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
      data?.count,
      cursorHistory.length,
      isLoading,
      error,
      goToNextPage,
      goToPrevPage,
      reset,
      currentCursor,
    ],
  )
}

function serializeSpans(spans: Span[]) {
  return spans.map((span) => ({
    ...span,
    startedAt: new Date(span.startedAt),
  }))
}
