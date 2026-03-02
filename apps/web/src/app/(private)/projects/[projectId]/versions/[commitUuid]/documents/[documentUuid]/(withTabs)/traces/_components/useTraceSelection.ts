import { use, useMemo } from 'react'
import { TraceSpanSelectionStateContext } from '$/components/traces/TraceSpanSelectionContext'

export function useTraceSelection() {
  const { selection } = use(TraceSpanSelectionStateContext)

  return useMemo(() => {
    const hasTrace = !!selection.documentLogUuid && !!selection.spanId

    const traceSelection = hasTrace
      ? {
          spanId: selection.spanId!,
          documentLogUuid: selection.documentLogUuid!,
        }
      : null

    return {
      any: hasTrace,
      trace: traceSelection,
    }
  }, [selection.spanId, selection.documentLogUuid])
}
