import {
  ATTR_LATITUDE_SEGMENT_ID,
  ATTR_LATITUDE_SEGMENT_PARENT_ID,
  ATTR_LATITUDE_SEGMENTS,
  TraceBaggage,
  TraceContext,
} from '../../browser'
import { BACKGROUND, TelemetryContext } from '../../telemetry'

const TRACEPARENT = (traceId: string, spanId: string) => {
  return `00-${traceId}-${spanId}-01`
}

const TRACEBAGGAGE = (baggage: TraceBaggage) => {
  const params = new URLSearchParams()
  params.set(ATTR_LATITUDE_SEGMENT_ID, baggage.segment.id)
  if (baggage.segment.parentId) {
    params.set(ATTR_LATITUDE_SEGMENT_PARENT_ID, baggage.segment.parentId)
  }
  params.set(ATTR_LATITUDE_SEGMENTS, JSON.stringify(baggage.segments))
  return params.toString().replaceAll('&', ',')
}

export async function createTelemetryContext(): Promise<TelemetryContext> {
  return BACKGROUND()
}

export async function createTelemetryTrace({
  traceId,
  spanId,
  baggage,
}: {
  traceId?: string
  spanId?: string
  baggage?: TraceBaggage
}): Promise<TraceContext> {
  traceId = traceId ?? '12345678901234567890123456789012'
  spanId = spanId ?? '1234567890123456'
  baggage = baggage ?? undefined

  return {
    traceparent: TRACEPARENT(traceId, spanId),
    tracestate: undefined,
    baggage: baggage ? TRACEBAGGAGE(baggage) : undefined,
  }
}
