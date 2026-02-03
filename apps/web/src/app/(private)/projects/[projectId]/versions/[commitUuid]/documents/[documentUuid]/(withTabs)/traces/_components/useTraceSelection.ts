import { use, useMemo } from 'react'
import { TraceSpanSelectionStateContext } from './TraceSpanSelectionContext'
import { ActiveRun } from '@latitude-data/constants'

export function useTraceSelection(activeRuns: ActiveRun[] = []) {
  const { selection } = use(TraceSpanSelectionStateContext)

  return useMemo(() => {
    const hasConversation = !!selection.documentLogUuid
    const hasSpan = !!selection.spanId
    const hasActiveRun = !!selection.activeRunUuid

    const anySelection = hasConversation || hasActiveRun

    const conversationSelection =
      hasConversation && !hasSpan
        ? { documentLogUuid: selection.documentLogUuid! }
        : null

    const traceSelection =
      hasConversation && hasSpan
        ? {
            spanId: selection.spanId!,
            documentLogUuid: selection.documentLogUuid!,
          }
        : null

    const run = hasActiveRun
      ? activeRuns.find((r) => r.uuid === selection.activeRunUuid)
      : null

    const activeRunSelection = run ? { run } : null

    return {
      any: anySelection,
      conversation: conversationSelection,
      trace: traceSelection,
      active: activeRunSelection,
    }
  }, [
    selection.spanId,
    selection.documentLogUuid,
    selection.activeRunUuid,
    activeRuns,
  ])
}
