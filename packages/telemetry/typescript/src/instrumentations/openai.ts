import type { Instrumentation } from "@opentelemetry/instrumentation"
import { OpenAIInstrumentationWithResponses } from "../sdk/instrumentations/openai/instrumentation.ts"
import { createManualInstrumentation, normalizeOpenAI } from "./shared.ts"

export function createOpenAIInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: OpenAIInstrumentationWithResponses,
    module: normalizeOpenAI(module),
    config: { enrichTokens: true },
  })
}
