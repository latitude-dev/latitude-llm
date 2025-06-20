import { LatitudeTelemetry, TelemetryOptions } from '@latitude-data/telemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export type * from '@latitude-data/telemetry'
export { BACKGROUND, Instrumentation } from '@latitude-data/telemetry'

let _telemetry: LatitudeTelemetry | undefined

export function telemetry(options: TelemetryOptions = {}) {
  if (_telemetry) return _telemetry

  // TODO(tracing): remove test exporter
  if (!options.exporter) {
    options.exporter = new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces',
      headers: {
        'Content-Type': 'application/json',
      },
      timeoutMillis: 30 * 1000,
    })
  }

  _telemetry = new LatitudeTelemetry('internal', options)

  return _telemetry
}
