import { BACKGROUND } from '../../telemetry'
import type { TraceContext, Workspace } from '../../browser'

const TRACEPARENT = (traceId: string, spanId: string) => {
  return `00-${traceId}-${spanId}-01`
}

export async function createTelemetryTrace({
  traceId,
  spanId,
}: {
  traceId?: string
  spanId?: string
}): Promise<TraceContext> {
  traceId = traceId ?? '12345678901234567890123456789012'
  spanId = spanId ?? '1234567890123456'

  return {
    traceparent: TRACEPARENT(traceId, spanId),
    tracestate: undefined,
  }
}

export function createTelemetryContext({ workspace }: { workspace: Workspace }) {
  return BACKGROUND({
    workspaceId: workspace.id,
  })
}
