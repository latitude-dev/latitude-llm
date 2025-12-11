'use client'

import { createContext, ReactNode, useState, useCallback } from 'react'
import { ReadonlyURLSearchParams, useSearchParams } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'
import { useNavigate } from '$/hooks/useNavigate'
import { AssembledSpan } from '@latitude-data/constants'

type SelectionState = {
  documentLogUuid: string | null
  spanId: string | null
  activeRunUuid: string | null
}

type RowType = 'trace' | 'activeRun'
type OnClickTraceRowParams<T extends RowType> = T extends 'trace'
  ? { data: { documentLogUuid: string; spanId: string }; type: T }
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
    selection: { documentLogUuid: null, spanId: null, activeRunUuid: null },
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
  const directDocumentLogUuid = params.get('documentLogUuid')
  const directSpanId = params.get('spanId')
  const directActiveRunUuid = params.get('activeRunUuid')
  let initialDocumentLogUuid = directDocumentLogUuid
  let initialSpanId = directSpanId

  if (!initialDocumentLogUuid || !initialSpanId) {
    const filtersParam = params.get('filters')
    const filters = parseSpansFilters(filtersParam, 'TraceSpanSelectionContext')
    if (filters) {
      initialDocumentLogUuid =
        initialDocumentLogUuid || filters.documentLogUuid || null
      initialSpanId = initialSpanId || filters.spanId || null
    }
  }
  return {
    documentLogUuid: initialDocumentLogUuid,
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
    setSelection({ documentLogUuid: null, spanId: null, activeRunUuid: null })
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('documentLogUuid')
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
            data.documentLogUuid === selection.documentLogUuid &&
            data.spanId === selection.spanId
          if (isSelected) {
            clearSelection()
            return
          }
          newParams.set('documentLogUuid', data.documentLogUuid)
          newParams.set('spanId', data.spanId)
          newParams.delete('activeRunUuid')
          setSelection({
            documentLogUuid: data.documentLogUuid,
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
          newParams.delete('documentLogUuid')
          newParams.delete('spanId')
          setSelection({
            documentLogUuid: null,
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
      const spanId = span?.id
      if (!spanId) return

      const documentLogUuid = span.documentLogUuid ?? selection.documentLogUuid
      if (!documentLogUuid) return

      onClickTraceRow({ type: 'trace', data: { documentLogUuid, spanId } })()
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
