import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain"
import type { Instrumentation } from "@opentelemetry/instrumentation"
import { createManualInstrumentation } from "./shared.ts"

export function createLangChainInstrumentation(module: object): Instrumentation {
  return createManualInstrumentation({
    Instrumentation: LangChainInstrumentation,
    module,
  })
}
