import type { Instrumentation } from "@opentelemetry/instrumentation"
import { CohereInstrumentation } from "@traceloop/instrumentation-cohere"
import { createManualInstrumentation } from "./shared.ts"

export function createCohereInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: CohereInstrumentation,
    module,
  })
}
