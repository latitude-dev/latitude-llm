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

  const defaultGenerate = <T>(_input: GenerateInput<T>) =>
    Effect.succeed({
      object: {} as T,
      tokens: 0,
      duration: 0,
    })

  const defaultEmbed = (_input: EmbedInput) => Effect.succeed({ embedding: [] })

  const defaultRerank = (_input: RerankInput) => Effect.succeed([])

  const ai: FakeAIShape = {
    generate: <T>(input: GenerateInput<T>) => {
      calls.generate.push(input as GenerateInput<unknown>)
      return (overrides?.generate ?? defaultGenerate)(input)
    },
    embed: (input) => {
      calls.embed.push(input)
      return (overrides?.embed ?? defaultEmbed)(input)
    },
    rerank: (input) => {
      calls.rerank.push(input)
      return (overrides?.rerank ?? defaultRerank)(input)
    },
  }

  return {
    ai,
    calls,
    layer: Layer.succeed(AI, ai),
  }
}
