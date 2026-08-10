import type { Instrumentation } from "@opentelemetry/instrumentation"
import { OpenAIAgentsInstrumentation } from "../sdk/instrumentations/openai-agents/instrumentation.ts"
import { createManualInstrumentation } from "./shared.ts"

export function createOpenAIAgentsInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({ Instrumentation: OpenAIAgentsInstrumentation, module })
}
