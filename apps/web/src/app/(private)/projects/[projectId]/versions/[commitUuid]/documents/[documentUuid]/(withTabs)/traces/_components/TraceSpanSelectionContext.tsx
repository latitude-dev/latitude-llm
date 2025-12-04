'use client'

import { createContext, ReactNode, useState, useCallback } from 'react'
import { ReadonlyURLSearchParams, useSearchParams } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'
import { useNavigate } from '$/hooks/useNavigate'
import { AssembledSpan } from '@latitude-data/constants'

type SelectionState = {
  traceId: string | null
  spanId: string | null
  activeRunUuid: string | null
}

type RowType = 'trace' | 'activeRun'
type OnClickTraceRowParams<T extends RowType> = T extends 'trace'
  ? { data: { traceId: string; spanId: string }; type: T }
  : { data: { runUuid: string }; type: T }
type OnClickTraceRowFunction = <T extends RowType>(
  params: OnClickTraceRowParams<T>,
) => () => void

type TraceSpanSelectionContextType = {
  selection: SelectionState
  onClickTraceRow: OnClickTraceRowFunction
  clearSelection: () => void
  selectSpan: (span?: AssembledSpan) => void
}

export const TraceSpanSelectionContext =
  createContext<TraceSpanSelectionContextType>({
    selection: { traceId: null, spanId: null, activeRunUuid: null },
    onClickTraceRow:
      <T extends RowType>(_args: OnClickTraceRowParams<T>) =>
      () => {},
    selectSpan: (_span?: AssembledSpan) => {},
    clearSelection: () => {},
  })

function initialSelectionState({
  params,
}: {
  params: ReadonlyURLSearchParams
}): SelectionState {
  const directTraceId = params.get('traceId')
  const directSpanId = params.get('spanId')
  const directActiveRunUuid = params.get('activeRunUuid')
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
  return {
    traceId: initialTraceId,
    spanId: initialSpanId,
    activeRunUuid: directActiveRunUuid,
  }
}

export function TraceSpanSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const params = useSearchParams()
  const router = useNavigate()
  const [selection, setSelection] = useState<SelectionState>(() =>
    initialSelectionState({ params }),
  )
  const clearSelection = useCallback(() => {
    setSelection({ traceId: null, spanId: null, activeRunUuid: null })
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('traceId')
    newParams.delete('spanId')
    newParams.delete('activeRunUuid')
    router.replace(`?${newParams.toString()}`)
  }, [params, router])

  const onClickTraceRow = useCallback(
    <T extends RowType>({ type, data }: OnClickTraceRowParams<T>) =>
      () => {
        const newParams = new URLSearchParams(params.toString())
        if (type === 'trace') {
          const isSelected =
            data.traceId === selection.traceId &&
            data.spanId === selection.spanId
          if (isSelected) {
            clearSelection()
            return
          }
          newParams.set('traceId', data.traceId)
          newParams.set('spanId', data.spanId)
          newParams.delete('activeRunUuid')
          setSelection({
            traceId: data.traceId,
            spanId: data.spanId,
            activeRunUuid: null,
          })
        } else if (type === 'activeRun') {
          const isSelected = data.runUuid === selection.activeRunUuid
          if (isSelected) {
            clearSelection()
            return
          }
          newParams.set('activeRunUuid', data.runUuid)
          newParams.delete('traceId')
          newParams.delete('spanId')
          setSelection({
            traceId: null,
            spanId: null,
            activeRunUuid: data.runUuid,
          })
        }
        router.replace(`?${newParams.toString()}`, { scroll: false })
      },
    [selection, params, router, clearSelection],
  )

  const selectSpan = useCallback(
    (span?: AssembledSpan) => {
      const traceId = selection.traceId
      if (!traceId) return

      const spanId = span?.id
      if (!spanId) return

      onClickTraceRow({ type: 'trace', data: { traceId, spanId } })()
    },
    [selection, onClickTraceRow],
  )

  return (
    <TraceSpanSelectionContext.Provider
      value={{
        selection,
        onClickTraceRow,
        selectSpan,
        clearSelection,
      }}
    >
      {children}
    </TraceSpanSelectionContext.Provider>
  )
}
