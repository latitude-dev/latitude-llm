import type { Instrumentation } from "@opentelemetry/instrumentation"
import { AnthropicInstrumentation } from "@traceloop/instrumentation-anthropic"
import { createManualInstrumentation, normalizeAnthropic } from "./shared.ts"

export function createAnthropicInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: AnthropicInstrumentation,
    module: normalizeAnthropic(module),
  })
}
