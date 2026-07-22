import type { Instrumentation } from "@opentelemetry/instrumentation"
import { LlamaIndexInstrumentation } from "@traceloop/instrumentation-llamaindex"
import { createManualInstrumentation } from "./shared.ts"

export function createLlamaIndexInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: LlamaIndexInstrumentation,
    module,
  })
}
