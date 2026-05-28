import type { CheckedState, InfiniteTableSelection } from "@repo/ui"
import { useCallback, useMemo, useRef } from "react"
import type { SessionRecord } from "../../../../../domains/sessions/sessions.functions.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"

/**
 * Adapts the sessions table — where rows are sessions and expanded sub-rows
 * are traces — onto a single trace-id-based selection state.
 *
 * Session-row checkbox clicks resolve to `selectMany`/`deselectMany` over all
 * of that session's `traceIds`. Trace sub-row clicks go through the shared
 * `useSelectableRows` hook directly. Shift+click is handled at both depths:
 *
 *   - Session rows: a local anchor (`lastClickedSessionIdRef`) drives range
 *     selection across `sessions` in display order; every trace inside the
 *     anchor→target slice flips check state.
 *   - Trace sub-rows: range selection uses the inner hook's `rowIds`, which
 *     this adapter builds from `expandedTraces` so the order matches the DOM
 *     (chronological asc from `sessionTracesQueryOptions`), not the
 *     ClickHouse `groupArray` order of `SessionRecord.traceIds`.
 *
 * Cross-depth shift+click (e.g. session-row anchor → trace-row target, or
 * vice versa) intentionally falls back to a plain toggle: the two anchors
 * live in separate refs so neither depth contaminates the other.
 */
export function useSessionSelectionAdapter({
  selectionState,
  onSelectionChange,
  sessions,
  totalTraceCount,
  expandedTraces,
}: {
  selectionState: SelectionState<string>
  onSelectionChange: (state: SelectionState<string>) => void
  sessions: readonly SessionRecord[]
  totalTraceCount: number
  /**
   * Per-session trace lists in **rendered (chronological-asc) order**, fetched
   * by `useExpandedSessionTraces`. Used to compute shift+click ranges for
   * expanded trace sub-rows — `SessionRecord.traceIds` is ClickHouse
   * `groupArray` order and doesn't match the DOM, which would slice the
   * wrong range.
   */
  expandedTraces: ReadonlyMap<string, { readonly data: readonly TraceRecord[]; readonly isLoading: boolean }>
}): InfiniteTableSelection {
  const sessionTraceIndex = useMemo(() => {
    const index = new Map<string, readonly string[]>()
    for (const s of sessions) index.set(s.sessionId, s.traceIds)
    return index
  }, [sessions])

  // Cast to plain string to match the `InfiniteTableSelection.toggleRow` key
  // type — `SessionId` is branded but the table works in unbranded strings.
  const visibleSessionIds = useMemo<string[]>(() => sessions.map((s) => s.sessionId as string), [sessions])

  // Flat list of trace IDs in the order the user actually sees them in the
  // table: for every session row, the expanded sub-rows (when present) appear
  // immediately under it. For collapsed sessions we fall back to
  // `SessionRecord.traceIds` so a session-row checkbox click still resolves
  // to a usable set (`selectMany` on those IDs); the order there doesn't
  // matter because the user can't shift+click between hidden rows.
  const allVisibleTraceIds = useMemo(() => {
    const ids: string[] = []
    for (const s of sessions) {
      const expanded = expandedTraces.get(s.sessionId)
      if (expanded && expanded.data.length > 0) {
        for (const t of expanded.data) ids.push(t.traceId as string)
      } else {
        for (const id of s.traceIds) ids.push(id as string)
      }
    }
    return ids
  }, [sessions, expandedTraces])

  const traceSelection = useSelectableRows({
    rowIds: allVisibleTraceIds,
    totalRowCount: totalTraceCount,
    controlledState: selectionState,
    onStateChange: onSelectionChange,
  })

  const lastClickedSessionIdRef = useRef<string | null>(null)

  const getSessionCheckedState = useCallback(
    (sessionId: string): CheckedState => {
      const traceIds = sessionTraceIndex.get(sessionId)
      if (!traceIds || traceIds.length === 0) return false
      const selectedCount = traceIds.filter((id) => traceSelection.isSelected(id)).length
      if (selectedCount === 0) return false
      if (selectedCount === traceIds.length) return true
      return "indeterminate"
    },
    [sessionTraceIndex, traceSelection],
  )

  const toggleSessionTraces = useCallback(
    (sessionId: string, checked: CheckedState) => {
      const traceIds = sessionTraceIndex.get(sessionId)
      if (!traceIds || traceIds.length === 0) return
      if (checked) {
        traceSelection.selectMany(traceIds as string[])
      } else {
        traceSelection.deselectMany(traceIds as string[])
      }
    },
    [sessionTraceIndex, traceSelection],
  )

  const toggleSessionRange = useCallback(
    (anchorSessionId: string, targetSessionId: string, checked: CheckedState) => {
      const anchorIndex = visibleSessionIds.indexOf(anchorSessionId)
      const targetIndex = visibleSessionIds.indexOf(targetSessionId)
      if (anchorIndex === -1 || targetIndex === -1) return

      const from = Math.min(anchorIndex, targetIndex)
      const to = Math.max(anchorIndex, targetIndex)
      const rangeTraceIds: string[] = []
      for (let i = from; i <= to; i++) {
        const sessionId = visibleSessionIds[i]
        if (!sessionId) continue
        const traceIds = sessionTraceIndex.get(sessionId)
        if (!traceIds) continue
        for (const id of traceIds) rangeTraceIds.push(id)
      }
      if (rangeTraceIds.length === 0) return

      if (checked) {
        traceSelection.selectMany(rangeTraceIds)
      } else {
        traceSelection.deselectMany(rangeTraceIds)
      }
    },
    [visibleSessionIds, sessionTraceIndex, traceSelection],
  )

  return useMemo(
    (): InfiniteTableSelection => ({
      headerState: traceSelection.headerState,
      isSelected: (key) => traceSelection.isSelected(key),
      getCheckedState: (key) => {
        if (sessionTraceIndex.has(key)) return getSessionCheckedState(key)
        return traceSelection.isSelected(key)
      },
      toggleRow: (key, checked, options) => {
        if (sessionTraceIndex.has(key)) {
          const anchor = lastClickedSessionIdRef.current
          if (options?.shiftKey && anchor && anchor !== key && sessionTraceIndex.has(anchor)) {
            toggleSessionRange(anchor, key, checked)
          } else {
            toggleSessionTraces(key, checked)
          }
          lastClickedSessionIdRef.current = key
          return
        }
        traceSelection.toggleRow(key, checked, options)
      },
      toggleAll: () => traceSelection.toggleAll(),
    }),
    [traceSelection, sessionTraceIndex, getSessionCheckedState, toggleSessionTraces, toggleSessionRange],
  )
}
