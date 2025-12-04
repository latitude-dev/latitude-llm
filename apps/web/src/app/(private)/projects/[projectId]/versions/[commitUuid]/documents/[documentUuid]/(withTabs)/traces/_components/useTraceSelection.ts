import { use, useMemo } from 'react'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'
import { ActiveRun } from '@latitude-data/constants'

export function useTraceSelection(activeRuns: ActiveRun[] = []) {
  const { selection } = use(TraceSpanSelectionContext)

  return useMemo(() => {
    const anySelection =
      (!!selection.spanId && !!selection.traceId) || !!selection.activeRunUuid

    const traceSelection =
      selection.traceId && selection.spanId
        ? { spanId: selection.spanId, traceId: selection.traceId }
        : null

    const run = selection.activeRunUuid
      ? activeRuns.find((r) => r.uuid === selection.activeRunUuid)
      : null

    const activeRunSelection = run ? { run } : null

    return {
      any: anySelection,
      trace: traceSelection,
      active: activeRunSelection,
    }
  }, [selection.spanId, selection.traceId, selection.activeRunUuid, activeRuns])
}
