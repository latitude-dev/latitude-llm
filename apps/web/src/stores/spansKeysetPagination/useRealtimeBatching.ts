import { useCallback, useEffect, useRef } from 'react'
import { Span } from '@latitude-data/constants'
import type { SpansKeysetPaginationResult } from './types'

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
    [realtime, isLoading, processBatchedSpans],
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
