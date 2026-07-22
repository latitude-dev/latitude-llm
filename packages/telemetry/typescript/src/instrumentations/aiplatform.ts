import type { Instrumentation } from "@opentelemetry/instrumentation"
import { AIPlatformInstrumentation } from "@traceloop/instrumentation-vertexai"
import { createManualInstrumentation } from "./shared.ts"

export function createAIPlatformInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: AIPlatformInstrumentation,
    module,
  })
}
