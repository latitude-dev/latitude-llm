'use client'

import { createContext, useContext, ReactNode, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'

type SelectionState = {
  traceId: string | null
  spanId: string | null
}

type TraceSpanSelectionContextType = {
  selection: SelectionState
  selectTraceSpan: (traceId: string, spanId: string) => void
  clearSelection: () => void
}

const TraceSpanSelectionContext = createContext<
  TraceSpanSelectionContextType | undefined
>(undefined)

export function TraceSpanSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const params = useSearchParams()
  const router = useRouter()

  // Get traceId and spanId from direct params first, fallback to filters
  const directTraceId = params.get('traceId')
  const directSpanId = params.get('spanId')

  let initialTraceId = directTraceId
  let initialSpanId = directSpanId

  // If not found in direct params, check filters
  if (!initialTraceId || !initialSpanId) {
    const filtersParam = params.get('filters')
    const filters = parseSpansFilters(filtersParam, 'TraceSpanSelectionContext')
    if (filters) {
      initialTraceId = initialTraceId || filters.traceId || null
      initialSpanId = initialSpanId || filters.spanId || null
    }
  }

  const [selection, setSelection] = useState<SelectionState>({
    traceId: initialTraceId,
    spanId: initialSpanId,
  })
  const selectTraceSpan = (traceId: string, spanId: string) => {
    setSelection({ traceId, spanId })

    const newParams = new URLSearchParams(params.toString())
    newParams.set('traceId', traceId)
    newParams.set('spanId', spanId)
    router.replace(`?${newParams.toString()}`, { scroll: true })
  }

  const clearSelection = () => {
    setSelection({ traceId: null, spanId: null })

    const newParams = new URLSearchParams(params.toString())
    newParams.delete('traceId')
    newParams.delete('spanId')
    router.replace(`?${newParams.toString()}`)
  }

  return (
    <TraceSpanSelectionContext.Provider
      value={{ selection, selectTraceSpan, clearSelection }}
    >
      {children}
    </TraceSpanSelectionContext.Provider>
  )
}

export function useTraceSpanSelection() {
  const context = useContext(TraceSpanSelectionContext)
  if (context === undefined) {
    throw new Error(
      'useTraceSpanSelection must be used within a TraceSpanSelectionProvider',
    )
  }
  return context
}
