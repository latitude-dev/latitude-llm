import type { Instrumentation } from "@opentelemetry/instrumentation"
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock"
import { createManualInstrumentation } from "./shared.ts"

export function createBedrockInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: BedrockInstrumentation,
    module,
  })
}
