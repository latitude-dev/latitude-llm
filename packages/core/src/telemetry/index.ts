import {
  DEFAULT_REDACT_SPAN_PROCESSOR,
  LatitudeTelemetry,
} from '@latitude-data/telemetry'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node'

export type * from '@latitude-data/telemetry'
export { BACKGROUND, Instrumentation } from '@latitude-data/telemetry'

class InternalExporter implements SpanExporter {
  constructor() {}

  export(
    _spans: ReadableSpan[],
    callback: (result: ExportResult) => void,
  ): void {
    // TODO(tracing): enqueue spans directly
    callback({ code: ExportResultCode.SUCCESS })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
}

const processors = [DEFAULT_REDACT_SPAN_PROCESSOR()]

const exporter = new InternalExporter()

export const telemetry = new LatitudeTelemetry('internal', {
  instrumentations: {},
  disableBatch: false,
  exporter: exporter,
  processors: processors,
})
