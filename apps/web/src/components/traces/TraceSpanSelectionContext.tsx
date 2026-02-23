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
import { useCurrentDocumentMaybe } from '$/app/providers/DocumentProvider'
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
  const { documentLogUuid: documentLogUuidParam, spanId: spanIdParam } =
    TRACE_SPAN_SELECTION_PARAM_KEYS

  params.delete(documentLogUuidParam)
  params.delete(spanIdParam)

  if (selection.documentLogUuid) {
    params.set(documentLogUuidParam, selection.documentLogUuid)
  }
  if (selection.spanId) {
    params.set(spanIdParam, selection.spanId)
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState(null, '', newUrl)
}

type SelectionState = {
  documentLogUuid: string | null
  spanId: string | null
}

type OnClickTraceRowFunction = (params: {
  documentLogUuid: string
  spanId?: string
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
      spanId: null,
    },
  })

function initialSelectionState(): SelectionState {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  const { documentLogUuid: documentLogUuidParam, spanId: spanIdParam } =
    TRACE_SPAN_SELECTION_PARAM_KEYS
  const directDocumentLogUuid = params.get(documentLogUuidParam)
  const directSpanId = params.get(spanIdParam)
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
  }
}

export function TraceSpanSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const documentContext = useCurrentDocumentMaybe()
  const documentUuid = documentContext?.document?.documentUuid

  const [selection, setSelection] = useState<SelectionState>(
    initialSelectionState,
  )

  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const clearSelection = useCallback(() => {
    const newSelection: SelectionState = {
      documentLogUuid: null,
      spanId: null,
    }
    setSelection(newSelection)
    syncUrlWithSelection(newSelection)
  }, [])

  const onClickTraceRow = useCallback(
    ({
      documentLogUuid,
      spanId,
    }: {
      documentLogUuid: string
      spanId?: string
    }) =>
      () => {
        const currentSelection = selectionRef.current
        const resolvedSpanId = spanId ?? null

        const isSelected =
          documentLogUuid === currentSelection.documentLogUuid &&
          resolvedSpanId === currentSelection.spanId
        if (isSelected) {
          clearSelection()
          return
        }

        if (spanId && documentUuid) {
          preloadTraceData({
            documentLogUuid,
            spanId,
            projectId: project.id,
            commitUuid: commit.uuid,
            commitId: commit.id,
            documentUuid,
          })
        }

        const newSelection: SelectionState = {
          documentLogUuid,
          spanId: resolvedSpanId,
        }
        setSelection(newSelection)
        syncUrlWithSelection(newSelection)
      },
    [clearSelection, commit.id, commit.uuid, documentUuid, project.id],
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
        spanId: null,
      }
      setSelection(newSelection)
      syncUrlWithSelection(newSelection)
      return
    }

    if (!currentDocumentLogUuid) return

    const newSelection: SelectionState = {
      documentLogUuid: currentDocumentLogUuid,
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
