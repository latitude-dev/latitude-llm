import { Effect, Layer } from "effect"
import {
  AI,
  type AICredentialError,
  type AIError,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type RerankInput,
  type RerankResult,
} from "../index.ts"

interface FakeAIShape {
  generate<T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError>
  embed(input: EmbedInput): Effect.Effect<EmbedResult, AIError>
  rerank(input: RerankInput): Effect.Effect<readonly RerankResult[], AIError>
}

export interface FakeAICalls {
  readonly generate: GenerateInput<unknown>[]
  readonly embed: EmbedInput[]
  readonly rerank: RerankInput[]
}

export const createFakeAI = (overrides?: Partial<FakeAIShape>) => {
  const calls: FakeAICalls = {
    generate: [],
    embed: [],
    rerank: [],
  }

  const ai: FakeAIShape = {
    generate: <T>(input: GenerateInput<T>) => {
      calls.generate.push(input as GenerateInput<unknown>)
      return Effect.succeed({
        object: {} as T,
        tokens: 0,
        duration: 0,
      })
    },
    embed: (input) => {
      calls.embed.push(input)
      return Effect.succeed({ embedding: [] })
    },
    rerank: (input) => {
      calls.rerank.push(input)
      return Effect.succeed([])
    },
    ...overrides,
  }

  return {
    ai,
    calls,
    layer: Layer.succeed(AI, ai),
  }
}
