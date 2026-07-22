import type { TracerProvider } from "@opentelemetry/api"
import { type Instrumentation, registerInstrumentations } from "@opentelemetry/instrumentation"

const MIGRATION_MESSAGE =
  "[Latitude] instrumentations must be an array created with the factories exported from " +
  '"@latitude-data/telemetry/instrumentations/*". See the migration guide in the package README.'

export type InstrumentationsInput = readonly Instrumentation[]

export function registerLatitudeInstrumentations(options: {
  instrumentations: InstrumentationsInput
  tracerProvider: TracerProvider
}): void {
  if (!Array.isArray(options.instrumentations)) throw new TypeError(MIGRATION_MESSAGE)

  registerInstrumentations({
    instrumentations: [...options.instrumentations],
    tracerProvider: options.tracerProvider,
  })
}
