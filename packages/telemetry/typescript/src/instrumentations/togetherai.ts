import type { Instrumentation } from "@opentelemetry/instrumentation"
import { TogetherInstrumentation } from "@traceloop/instrumentation-together"
import { createManualInstrumentation } from "./shared.ts"

export function createTogetherAIInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: TogetherInstrumentation,
    module,
    config: { enrichTokens: false },
  })
}
