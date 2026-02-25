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
import { Conversation, getConversationKey } from '$/stores/conversations'
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
    spanId: spanIdParam,
    activeRunUuid: activeRunUuidParam,
    expandedDocumentLogUuid: expandedDocumentLogUuidParam,
  } = TRACE_SPAN_SELECTION_PARAM_KEYS

  params.delete(documentLogUuidParam)
  params.delete(spanIdParam)
  params.delete(activeRunUuidParam)
  params.delete(expandedDocumentLogUuidParam)

  if (selection.documentLogUuid) {
    params.set(documentLogUuidParam, selection.documentLogUuid)
  }
  if (selection.spanId) {
    params.set(spanIdParam, selection.spanId)
  }
  if (selection.activeRunUuid) {
    params.set(activeRunUuidParam, selection.activeRunUuid)
  }
  if (selection.expandedDocumentLogUuid) {
    params.set(expandedDocumentLogUuidParam, selection.expandedDocumentLogUuid)
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState(null, '', newUrl)
}

type SelectionState = {
  documentLogUuid: string | null
  spanId: string | null
  activeRunUuid: string | null
  expandedDocumentLogUuid: string | null
}

type RowType = 'trace' | 'activeRun'
type OnClickTraceRowParams<T extends RowType> = T extends 'trace'
  ? { data: { documentLogUuid: string; spanId: string }; type: T }
  : { data: { runUuid: string }; type: T }
type OnClickTraceRowFunction = <T extends RowType>(
  params: OnClickTraceRowParams<T>,
) => () => void

type OnClickConversationRowFunction = (conversation: Conversation) => () => void

type TraceSpanSelectionActionsContextType = {
  onClickTraceRow: OnClickTraceRowFunction
  onClickConversationRow: OnClickConversationRowFunction
  clearSelection: () => void
  selectSpan: (span?: AssembledSpan) => void
}

type TraceSpanSelectionStateContextType = {
  selection: SelectionState
}

export const TraceSpanSelectionActionsContext =
  createContext<TraceSpanSelectionActionsContextType>({
    onClickTraceRow:
      <T extends RowType>(_args: OnClickTraceRowParams<T>) =>
      () => {},
    onClickConversationRow: (_conversation: Conversation) => async () => {},
    selectSpan: (_span?: AssembledSpan) => {},
    clearSelection: () => {},
  })

export const TraceSpanSelectionStateContext =
  createContext<TraceSpanSelectionStateContextType>({
    selection: {
      documentLogUuid: null,
      spanId: null,
      activeRunUuid: null,
      expandedDocumentLogUuid: null,
    },
  })

function initialSelectionState(): SelectionState {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  const {
    documentLogUuid: documentLogUuidParam,
    spanId: spanIdParam,
    activeRunUuid: activeRunUuidParam,
    expandedDocumentLogUuid: expandedDocumentLogUuidParam,
  } = TRACE_SPAN_SELECTION_PARAM_KEYS
  const directDocumentLogUuid = params.get(documentLogUuidParam)
  const directSpanId = params.get(spanIdParam)
  const directActiveRunUuid = params.get(activeRunUuidParam)
  const directExpandedDocumentLogUuid = params.get(expandedDocumentLogUuidParam)
  let initialDocumentLogUuid = directDocumentLogUuid
  let initialSpanId = directSpanId
  let initialExpandedDocumentLogUuid = directExpandedDocumentLogUuid

  if (!initialDocumentLogUuid || !initialSpanId) {
    const filtersParam = params.get('filters')
    const filters = parseSpansFilters(filtersParam, 'TraceSpanSelectionContext')
    if (filters) {
      initialDocumentLogUuid =
        initialDocumentLogUuid || filters.documentLogUuid || null
      initialSpanId = initialSpanId || filters.spanId || null
      initialExpandedDocumentLogUuid =
        initialExpandedDocumentLogUuid || filters.documentLogUuid || null
    }
  }
  return {
    documentLogUuid: initialDocumentLogUuid,
    spanId: initialSpanId,
    activeRunUuid: directActiveRunUuid,
    expandedDocumentLogUuid: initialExpandedDocumentLogUuid,
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
      spanId: null,
      activeRunUuid: null,
      expandedDocumentLogUuid: null,
    }
    setSelection(newSelection)
    syncUrlWithSelection(newSelection)
  }, [])

  const onClickTraceRow = useCallback(
    <T extends RowType>({ type, data }: OnClickTraceRowParams<T>) =>
      () => {
        const currentSelection = selectionRef.current

        if (type === 'trace') {
          const isSelected =
            data.documentLogUuid === currentSelection.documentLogUuid &&
            data.spanId === currentSelection.spanId
          if (isSelected) {
            clearSelection()
            return
          }

          preloadTraceData({
            documentLogUuid: data.documentLogUuid,
            spanId: data.spanId,
            projectId: project.id,
            commitUuid: commit.uuid,
            commitId: commit.id,
            documentUuid: document.documentUuid,
          })

          const newSelection: SelectionState = {
            documentLogUuid: data.documentLogUuid,
            spanId: data.spanId,
            activeRunUuid: null,
            expandedDocumentLogUuid: null,
          }
          setSelection(newSelection)
          syncUrlWithSelection(newSelection)
        } else if (type === 'activeRun') {
          const isSelected = data.runUuid === currentSelection.activeRunUuid
          if (isSelected) {
            clearSelection()
            return
          }
          const newSelection: SelectionState = {
            documentLogUuid: null,
            spanId: null,
            activeRunUuid: data.runUuid,
            expandedDocumentLogUuid: null,
          }
          setSelection(newSelection)
          syncUrlWithSelection(newSelection)
        }
      },
    [clearSelection, commit.id, commit.uuid, document.documentUuid, project.id],
  )

  const onClickConversationRow = useCallback(
    (conversation: Conversation) => async () => {
      const { documentLogUuid, traceCount } = conversation
      if (!documentLogUuid) return
      const currentSelection = selectionRef.current

      const isExpanded =
        documentLogUuid === currentSelection.expandedDocumentLogUuid
      if (isExpanded) {
        clearSelection()
        return
      }

      const conversationKey = getConversationKey({
        conversationId: documentLogUuid,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      if (traceCount === 1) {
        const data = await executeFetch<{
          traces: { children: { id: string }[] }[]
        }>({
          route: conversationKey,
        })
        const firstSpanId = data?.traces?.[0]?.children?.[0]?.id
        if (firstSpanId) {
          preloadTraceData({
            documentLogUuid,
            spanId: firstSpanId,
            projectId: project.id,
            commitUuid: commit.uuid,
            commitId: commit.id,
            documentUuid: document.documentUuid,
          })
          const newSelection: SelectionState = {
            documentLogUuid,
            spanId: firstSpanId,
            activeRunUuid: null,
            expandedDocumentLogUuid: documentLogUuid,
          }
          setSelection(newSelection)
          syncUrlWithSelection(newSelection)
          return
        }
      }

      preload(conversationKey, () => executeFetch({ route: conversationKey }))

      const newSelection: SelectionState = {
        documentLogUuid,
        spanId: null,
        activeRunUuid: null,
        expandedDocumentLogUuid: documentLogUuid,
      }
      setSelection(newSelection)
      syncUrlWithSelection(newSelection)
    },
    [clearSelection, project.id, commit.uuid, commit.id, document.documentUuid],
  )

  const selectSpan = useCallback((span?: AssembledSpan) => {
    const currentSelection = selectionRef.current
    const spanId = span?.id
    const expandedDocumentLogUuid = currentSelection.expandedDocumentLogUuid

    if (!spanId) {
      if (!expandedDocumentLogUuid) return
      if (!currentSelection.spanId) return

      const newSelection: SelectionState = {
        documentLogUuid: expandedDocumentLogUuid,
        spanId: null,
        activeRunUuid: null,
        expandedDocumentLogUuid,
      }
      setSelection(newSelection)
      syncUrlWithSelection(newSelection)
      return
    }

    if (!expandedDocumentLogUuid) return

    const isSubagentSpan =
      span.documentLogUuid && span.documentLogUuid !== expandedDocumentLogUuid

    const newSelection: SelectionState = {
      documentLogUuid: isSubagentSpan
        ? span.documentLogUuid!
        : expandedDocumentLogUuid,
      spanId,
      activeRunUuid: null,
      expandedDocumentLogUuid,
    }

    setSelection(newSelection)
    syncUrlWithSelection(newSelection)
  }, [])

  const actionsValue = useMemo(
    () => ({
      onClickTraceRow,
      onClickConversationRow,
      selectSpan,
      clearSelection,
    }),
    [onClickTraceRow, onClickConversationRow, selectSpan, clearSelection],
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
