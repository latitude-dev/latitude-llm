import type { SeedSpanDefinition, SeedSystemPart } from "./otlp.ts"
import type { SeededRng } from "./random.ts"

export type SamplingPlan = {
  readonly includeEvaluationIds?: readonly string[]
  readonly excludeEvaluationIds?: readonly string[]
  readonly liveQueueSample?: boolean
  readonly flaggerSamples?: Readonly<Record<string, boolean>>
}

export type LiveSeedGeneratedCaseTrace = {
  readonly key: string
  readonly role: "target" | "context"
  readonly startDelayMs: number
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

export type LiveSeedGeneratedCase = {
  readonly sessionId: string
  readonly userId: string
  readonly traces: readonly LiveSeedGeneratedCaseTrace[]
}

export type FixtureGenerationContext = {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly instanceIndex: number
  readonly runSeed: string
}

export type LiveSeedFixtureDefinition = {
  readonly key: string
  readonly description: string
  readonly sampling: SamplingPlan
  readonly deterministicFlaggerMatches: readonly string[]
  readonly llmSystemIntents: readonly string[]
  readonly generateCase: (context: FixtureGenerationContext) => LiveSeedGeneratedCase
}
