import type { Instrumentation } from "@opentelemetry/instrumentation"
import { VertexAIInstrumentation } from "@traceloop/instrumentation-vertexai"
import { createManualInstrumentation } from "./shared.ts"

export function createVertexAIInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: VertexAIInstrumentation,
    module,
  })
}
