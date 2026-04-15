import type { SeedSpanDefinition, SeedSystemPart } from "./otlp.ts"
import type { SeededRng } from "./random.ts"

export type SamplingPlan = {
  readonly includeEvaluationIds?: readonly string[]
  readonly excludeEvaluationIds?: readonly string[]
  readonly liveQueueSample?: boolean
  readonly systemQueueSamples?: Readonly<Record<string, boolean>>
}

export type LiveMonitorGeneratedTrace = {
  readonly startDelayMs: number
  readonly sessionId: string
  readonly userId: string
  readonly serviceName: string
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly spans: readonly SeedSpanDefinition[]
  readonly provider?: string
  readonly model?: string
  readonly scopeName?: string
  readonly scopeVersion?: string
  readonly traits?: {
    readonly highCost?: boolean
    readonly supportService?: boolean
  }
}

export type FixtureGenerationContext = {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly instanceIndex: number
  readonly runSeed: string
}

export type LiveMonitorFixtureDefinition = {
  readonly key: string
  readonly description: string
  readonly sampling: SamplingPlan
  readonly deterministicSystemMatches: readonly string[]
  readonly llmSystemIntents: readonly string[]
  readonly generateTrace: (context: FixtureGenerationContext) => LiveMonitorGeneratedTrace
}
