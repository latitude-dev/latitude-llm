import type { Instrumentation } from "@opentelemetry/instrumentation"

interface ManualInstrumentation extends Instrumentation {
  manuallyInstrument?(module: unknown): void
}

type InstrumentationConstructor = new (config?: Record<string, unknown>) => ManualInstrumentation

export function createManualInstrumentation(options: {
  Instrumentation: InstrumentationConstructor
  module: unknown
  config?: Record<string, unknown>
}): Instrumentation {
  const instrumentation = new options.Instrumentation(options.config)
  instrumentation.manuallyInstrument?.(options.module)
  return instrumentation
}

export function normalizeOpenAI(module: unknown): unknown {
  const namespace = module as { OpenAI?: unknown; default?: unknown } | null | undefined
  return namespace?.OpenAI ?? namespace?.default ?? module
}

export function normalizeAnthropic(module: unknown): unknown {
  const hasAnthropicField = module !== null && typeof module === "object" && "Anthropic" in module
  return hasAnthropicField ? module : { Anthropic: module }
}
