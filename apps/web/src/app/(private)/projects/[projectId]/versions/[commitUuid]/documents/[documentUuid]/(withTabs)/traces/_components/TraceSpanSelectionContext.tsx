'use client'

import {
  createContext,
  ReactNode,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import { preload } from 'swr'
import { parseSpansFilters } from '$/lib/schemas/filters'
import { TRACE_SPAN_SELECTION_PARAM_KEYS } from '$/lib/buildTraceUrl'
import { AssembledSpan } from '@latitude-data/constants'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { executeFetch } from '$/hooks/useFetcher'
import { getConversationKey } from '$/stores/conversations/useConversation'
import { getSpanKey } from '$/stores/spans'
import { getEvaluationResultsV2BySpansKey } from '$/stores/evaluationResultsV2/bySpans'

function preloadTraceData({
  projectId,
  commitUuid,
  commitId,
  documentUuid,
  documentLogUuid,
  spanId,
}: {
  documentLogUuid: string
  spanId: string
  projectId: number
  commitUuid: string
  commitId: number
  documentUuid: string
}) {
  const conversationKey = getConversationKey({
    conversationId: documentLogUuid,
    projectId,
    commitUuid,
    documentUuid,
  })
  const { route: spanRoute, key: spanKey } = getSpanKey(documentLogUuid, spanId)
  const {
    route: evaluationsRoute,
    key: evaluationsKey,
    searchParams: evaluationsSearchParams,
  } = getEvaluationResultsV2BySpansKey({
    projectId,
    commitUuid,
    commitId,
    documentUuid,
    spanId,
    documentLogUuid,
  })

  if (conversationKey) {
    preload(conversationKey, () => executeFetch({ route: conversationKey }))
  }
  if (spanKey && spanRoute) {
    preload(spanKey, () => executeFetch({ route: spanRoute }))
  }
  if (evaluationsKey && evaluationsRoute) {
    preload(evaluationsKey, () =>
      executeFetch({
        route: evaluationsRoute,
        searchParams: evaluationsSearchParams,
      }),
    )
  }
}

function syncUrlWithSelection(selection: SelectionState) {
  const params = new URLSearchParams(window.location.search)
  const {
    documentLogUuid: documentLogUuidParam,
    traceId: traceIdParam,
    spanId: spanIdParam,
  } = TRACE_SPAN_SELECTION_PARAM_KEYS

  params.delete(documentLogUuidParam)
  params.delete(traceIdParam)
  params.delete(spanIdParam)

  if (selection.documentLogUuid) {
    params.set(documentLogUuidParam, selection.documentLogUuid)
  }
  if (selection.traceId) {
    params.set(traceIdParam, selection.traceId)
  }
  if (selection.spanId) {
    params.set(spanIdParam, selection.spanId)
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState(null, '', newUrl)
}

type SelectionState = {
  documentLogUuid: string | null
  traceId: string | null
  spanId: string | null
}

type OnClickTraceRowFunction = (params: {
  documentLogUuid: string
  spanId: string
  traceId: string
}) => () => void

type TraceSpanSelectionActionsContextType = {
  onClickTraceRow: OnClickTraceRowFunction
  clearSelection: () => void
  selectSpan: (span?: AssembledSpan) => void
}

type TraceSpanSelectionStateContextType = {
  selection: SelectionState
}

export const TraceSpanSelectionActionsContext =
  createContext<TraceSpanSelectionActionsContextType>({
    onClickTraceRow: (_params) => () => {},
    selectSpan: (_span?: AssembledSpan) => {},
    clearSelection: () => {},
  })

export const TraceSpanSelectionStateContext =
  createContext<TraceSpanSelectionStateContextType>({
    selection: {
      documentLogUuid: null,
      traceId: null,
      spanId: null,
    },
  })

function initialSelectionState(): SelectionState {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  const {
    documentLogUuid: documentLogUuidParam,
    traceId: traceIdParam,
    spanId: spanIdParam,
  } = TRACE_SPAN_SELECTION_PARAM_KEYS
  const directDocumentLogUuid = params.get(documentLogUuidParam)
  const directTraceId = params.get(traceIdParam)
  const directSpanId = params.get(spanIdParam)
  let initialDocumentLogUuid = directDocumentLogUuid
  const initialTraceId = directTraceId
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
    traceId: initialTraceId,
    spanId: initialSpanId,
  }
}

export function TraceSpanSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [selection, setSelection] = useState<SelectionState>(
    initialSelectionState,
  )

  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const clearSelection = useCallback(() => {
    const newSelection: SelectionState = {
      documentLogUuid: null,
      traceId: null,
      spanId: null,
    }
    setSelection(newSelection)
    syncUrlWithSelection(newSelection)
  }, [])

  const onClickTraceRow = useCallback(
    ({
      documentLogUuid,
      spanId,
      traceId,
    }: {
      documentLogUuid: string
      spanId: string
      traceId: string
    }) =>
      () => {
        const currentSelection = selectionRef.current
        const isSelected =
          documentLogUuid === currentSelection.documentLogUuid &&
          spanId === currentSelection.spanId &&
          traceId === currentSelection.traceId
        if (isSelected) {
          clearSelection()
          return
        }

        preloadTraceData({
          documentLogUuid,
          spanId,
          projectId: project.id,
          commitUuid: commit.uuid,
          commitId: commit.id,
          documentUuid: document.documentUuid,
        })

        const newSelection: SelectionState = {
          documentLogUuid,
          traceId,
          spanId,
        }
        setSelection(newSelection)
        syncUrlWithSelection(newSelection)
      },
    [clearSelection, commit.id, commit.uuid, document.documentUuid, project.id],
  )

  const selectSpan = useCallback((span?: AssembledSpan) => {
    const currentSelection = selectionRef.current
    const spanId = span?.id
    const currentDocumentLogUuid = currentSelection.documentLogUuid

    if (!spanId) {
      if (!currentDocumentLogUuid) return
      if (!currentSelection.spanId) return

      const newSelection: SelectionState = {
        documentLogUuid: currentDocumentLogUuid,
        traceId: currentSelection.traceId,
        spanId: null,
      }
      setSelection(newSelection)
      syncUrlWithSelection(newSelection)
      return
    }

    if (!currentDocumentLogUuid) return

    const newSelection: SelectionState = {
      documentLogUuid: currentDocumentLogUuid,
      traceId: span.traceId,
      spanId,
    }

    setSelection(newSelection)
    syncUrlWithSelection(newSelection)
  }, [])

  const actionsValue = useMemo(
    () => ({
      onClickTraceRow,
      selectSpan,
      clearSelection,
    }),
    [onClickTraceRow, selectSpan, clearSelection],
  )

  const stateValue = useMemo(
    () => ({
      selection,
    }),
    [selection],
  )

  return (
    <TraceSpanSelectionActionsContext.Provider value={actionsValue}>
      <TraceSpanSelectionStateContext.Provider value={stateValue}>
        {children}
      </TraceSpanSelectionStateContext.Provider>
    </TraceSpanSelectionActionsContext.Provider>
  )
}
