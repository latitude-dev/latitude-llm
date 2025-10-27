'use client'

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

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
  const [selection, setSelection] = useState<SelectionState>({
    traceId: params.get('traceId'),
    spanId: params.get('spanId'),
  })
  const selectTraceSpan = (traceId: string, spanId: string) => {
    setSelection({ traceId, spanId })
  }

  const clearSelection = () => {
    setSelection({ traceId: null, spanId: null })
  }
  useEffect(() => {
    const currentTraceId = params.get('traceId')
    const currentSpanId = params.get('spanId')

    if (
      selection.traceId !== currentTraceId ||
      selection.spanId !== currentSpanId
    ) {
      const newParams = new URLSearchParams(params.toString())

      if (selection.traceId) {
        newParams.set('traceId', selection.traceId)
      } else {
        newParams.delete('traceId')
      }

      if (selection.spanId) {
        newParams.set('spanId', selection.spanId)
      } else {
        newParams.delete('spanId')
      }

      router.replace(`?${newParams.toString()}`, { scroll: true })
    }
  }, [selection, params, router])

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
