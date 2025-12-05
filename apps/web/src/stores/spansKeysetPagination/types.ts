import { LogSources, Span, SpanType } from '@latitude-data/constants'
import { KeyedMutator } from 'swr'

export interface SpansKeysetPaginationResult {
  items: Span[]
  count: number | null
  next: string | null
}

export interface UseSpansKeysetPaginationParams {
  projectId: string
  commitUuid?: string
  documentUuid?: string
  type?: SpanType
  initialItems?: Span[]
  limit?: number
  source?: LogSources[]
  realtime?: boolean
}

export interface UseSpansKeysetPaginationReturn {
  items: Span[]
  count: number | null
  hasNext: boolean
  hasPrev: boolean
  isLoading: boolean
  error: Error | undefined
  goToNextPage: () => void
  goToPrevPage: () => void
  reset: () => void
  mutate: KeyedMutator<SpansKeysetPaginationResult> | any // swr does not export the type for infinite keyed mutators
  currentCursor: string | null
  cursorHistoryLength: number
}
