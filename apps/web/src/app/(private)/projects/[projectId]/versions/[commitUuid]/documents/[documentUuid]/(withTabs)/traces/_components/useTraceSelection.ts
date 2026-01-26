import { use, useMemo } from 'react'
import { TraceSpanSelectionStateContext } from './TraceSpanSelectionContext'
import { ActiveRun } from '@latitude-data/constants'

export function useTraceSelection(activeRuns: ActiveRun[] = []) {
  const { selection } = use(TraceSpanSelectionStateContext)

  return useMemo(() => {
    const anySelection =
      (!!selection.spanId && !!selection.documentLogUuid) ||
      !!selection.activeRunUuid

    const traceSelection =
      selection.documentLogUuid && selection.spanId
        ? {
            spanId: selection.spanId,
            documentLogUuid: selection.documentLogUuid,
          }
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
  }, [
    selection.spanId,
    selection.documentLogUuid,
    selection.activeRunUuid,
    activeRuns,
  ])
}
