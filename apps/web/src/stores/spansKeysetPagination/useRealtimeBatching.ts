import { useCallback, useEffect, useRef } from 'react'
import { Span } from '@latitude-data/constants'
import type {
  SpansKeysetPaginationResult,
  UseSpansKeysetPaginationParams,
} from './types'
import type { SpansFilters } from '$/lib/schemas/filters'

type InfiniteMutator = (
  data?:
    | SpansKeysetPaginationResult[]
    | Promise<SpansKeysetPaginationResult[]>
    | ((
        prev: SpansKeysetPaginationResult[] | undefined,
      ) => SpansKeysetPaginationResult[] | undefined),
  shouldRevalidate?: boolean,
) => Promise<SpansKeysetPaginationResult[] | undefined>

const BATCH_SIZE_THRESHOLD = 10
const BATCH_DEBOUNCE_MS = 100

export function useRealtimeBatching(
  realtime: boolean,
  isLoading: boolean,
  mutate: InfiniteMutator,
  params: UseSpansKeysetPaginationParams,
  filters: SpansFilters = {},
) {
  const spanQueueRef = useRef<Span[]>([])
  const batchTimeoutRef = useRef<any | null>(null)
  const mutateRef = useRef(mutate)

  useEffect(() => {
    mutateRef.current = mutate
  }, [mutate])

  const processBatchedSpans = useCallback(() => {
    if (spanQueueRef.current.length === 0) return

    const spansToAdd = [...spanQueueRef.current]
    spanQueueRef.current = []

    mutateRef.current((prev: SpansKeysetPaginationResult[] | undefined) => {
      if (!prev || prev.length === 0) return prev
      const firstPage = prev[0]
      if (!firstPage) return prev

      const existingIds = new Set(firstPage.items.map((item: Span) => item.id))
      const uniqueNewSpans = spansToAdd.filter(
        (span) => !existingIds.has(span.id),
      )

      if (uniqueNewSpans.length === 0) return prev

      return [
        {
          ...firstPage,
          items: [...uniqueNewSpans, ...firstPage.items],
        },
        ...prev.slice(1),
      ]
    }, false)
  }, [])

  const queueSpan = useCallback(
    (span: Span) => {
      if (!realtime || isLoading) return
      if (!shouldIncludeSpan(span, params, filters)) return

      spanQueueRef.current.push(span)

      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }

      if (spanQueueRef.current.length >= BATCH_SIZE_THRESHOLD) {
        processBatchedSpans()
      } else {
        batchTimeoutRef.current = setTimeout(() => {
          processBatchedSpans()
        }, BATCH_DEBOUNCE_MS)
      }
    },
    [realtime, isLoading, processBatchedSpans, params, filters],
  )

  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
      if (spanQueueRef.current.length > 0) {
        processBatchedSpans()
      }
    }
  }, [realtime, processBatchedSpans])

  return { queueSpan }
}

function shouldIncludeSpan(
  span: Span,
  params: UseSpansKeysetPaginationParams,
  filters: SpansFilters,
): boolean {
  if (params.commitUuid && span.commitUuid !== params.commitUuid) {
    return false
  }

  if (params.documentUuid && span.documentUuid !== params.documentUuid) {
    return false
  }

  if (params.type && span.type !== params.type) {
    return false
  }

  if (params.source && params.source.length > 0) {
    if (!span.source || !params.source.includes(span.source)) {
      return false
    }
  }

  if (filters.commitUuids && filters.commitUuids.length > 0) {
    if (!span.commitUuid || !filters.commitUuids.includes(span.commitUuid)) {
      return false
    }
  }

  if (filters.experimentUuids && filters.experimentUuids.length > 0) {
    if (
      !span.experimentUuid ||
      !filters.experimentUuids.includes(span.experimentUuid)
    ) {
      return false
    }
  }

  if (filters.testDeploymentIds && filters.testDeploymentIds.length > 0) {
    if (
      span.testDeploymentId === undefined ||
      !filters.testDeploymentIds.includes(span.testDeploymentId)
    ) {
      return false
    }
  }

  if (filters.createdAt) {
    const spanDate = span.createdAt
    if (filters.createdAt.from && spanDate < filters.createdAt.from) {
      return false
    }
    if (filters.createdAt.to && spanDate > filters.createdAt.to) {
      return false
    }
  }

  if (filters.traceId && span.traceId !== filters.traceId) {
    return false
  }

  if (filters.spanId && span.id !== filters.spanId) {
    return false
  }

  return true
}
