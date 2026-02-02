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
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { AssembledSpan, Span } from '@latitude-data/constants'
import { ROUTES } from '$/services/routes'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { executeFetch } from '$/hooks/useFetcher'
import { getConversationKey } from '$/stores/conversations'
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
  const conversationKey = getConversationKey(documentLogUuid)
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

export function buildTraceUrl({
  projectId,
  commitUuid,
  documentUuid,
  span,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  span: Pick<Span, 'id' | 'documentLogUuid'>
}) {
  const params = new URLSearchParams()
  const filters: SpansFilters = {
    spanId: span.id,
  }
  if (span.documentLogUuid) {
    filters.documentLogUuid = span.documentLogUuid
  }
  params.set('filters', JSON.stringify(filters))
  return (
    ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).traces.root +
    `?${params.toString()}`
  )
}

function syncUrlWithSelection(selection: SelectionState) {
  const params = new URLSearchParams(window.location.search)

  params.delete('documentLogUuid')
  params.delete('spanId')
  params.delete('activeRunUuid')
  params.delete('expandedDocumentLogUuid')

  if (selection.documentLogUuid) {
    params.set('documentLogUuid', selection.documentLogUuid)
  }
  if (selection.spanId) {
    params.set('spanId', selection.spanId)
  }
  if (selection.activeRunUuid) {
    params.set('activeRunUuid', selection.activeRunUuid)
  }
  if (selection.expandedDocumentLogUuid) {
    params.set('expandedDocumentLogUuid', selection.expandedDocumentLogUuid)
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
    onClickTraceRow:
      <T extends RowType>(_args: OnClickTraceRowParams<T>) =>
      () => {},
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
  const directDocumentLogUuid = params.get('documentLogUuid')
  const directSpanId = params.get('spanId')
  const directActiveRunUuid = params.get('activeRunUuid')
  const directExpandedDocumentLogUuid = params.get('expandedDocumentLogUuid')
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
    expandedDocumentLogUuid: directExpandedDocumentLogUuid,
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

  const selectSpan = useCallback((span?: AssembledSpan) => {
    const spanId = span?.id
    if (!spanId) return

    const currentSelection = selectionRef.current

    // When selecting from trace graph, always preserve the original parent's documentLogUuid
    // Use expandedDocumentLogUuid if set (parent trace), otherwise use current documentLogUuid
    // Only use span's documentLogUuid if we don't have one in selection at all
    const parentDocumentLogUuid =
      currentSelection.expandedDocumentLogUuid ??
      currentSelection.documentLogUuid
    const documentLogUuid = parentDocumentLogUuid ?? span.documentLogUuid
    if (!documentLogUuid) return

    const isSubagentSpan =
      span.documentLogUuid && span.documentLogUuid !== parentDocumentLogUuid

    const newSelection: SelectionState = isSubagentSpan
      ? {
          documentLogUuid: span.documentLogUuid!,
          spanId,
          activeRunUuid: null,
          expandedDocumentLogUuid: parentDocumentLogUuid,
        }
      : {
          documentLogUuid,
          spanId,
          activeRunUuid: null,
          expandedDocumentLogUuid: currentSelection.expandedDocumentLogUuid,
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
