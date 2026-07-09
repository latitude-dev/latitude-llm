import type { OtlpExportTraceServiceRequest } from "@domain/spans/otlp"

export const ELEVENLABS_OTEL_WEBHOOK_TYPE = "post_call_transcription_otel" as const

export interface ElevenlabsOtelWebhookEvent {
  readonly type: typeof ELEVENLABS_OTEL_WEBHOOK_TYPE
  readonly event_timestamp?: number
  readonly data: {
    readonly conversation_id: string
    readonly agent_id?: string
    readonly otlp_traces: OtlpExportTraceServiceRequest
  }
}

export const parseElevenlabsOtelWebhookEvent = (rawBody: string): ElevenlabsOtelWebhookEvent | null => {
  try {
    const parsed = JSON.parse(rawBody) as ElevenlabsOtelWebhookEvent
    if (parsed.type !== ELEVENLABS_OTEL_WEBHOOK_TYPE) return null
    if (!parsed.data?.otlp_traces?.resourceSpans) return null
    return parsed
  } catch {
    return null
  }
}
