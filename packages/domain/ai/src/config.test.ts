import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_RERANKING_CONFIG,
  resolveEmbeddingConfig,
  resolveGenerationConfig,
  resolveRerankingConfig,
} from "./config.ts"

const TOUCHED_VARS = [
  "LAT_AI_FLAGGER_CLASSIFIER_PROVIDER",
  "LAT_AI_FLAGGER_CLASSIFIER_MODEL",
  "LAT_AI_FLAGGER_CLASSIFIER_REASONING",
  "LAT_AI_FLAGGER_CLASSIFIER_TEMPERATURE",
  "LAT_AI_FLAGGER_CLASSIFIER_MAX_TOKENS",
  "LAT_AI_GENERATION_PROVIDER",
  "LAT_AI_GENERATION_MODEL",
  "LAT_AI_GENERATION_REASONING",
  "LAT_AI_GENERATION_TEMPERATURE",
  "LAT_AI_GENERATION_MAX_TOKENS",
  "LAT_AI_EMBEDDING_PROVIDER",
  "LAT_AI_EMBEDDING_MODEL",
  "LAT_AI_RERANKING_PROVIDER",
  "LAT_AI_RERANKING_MODEL",
]

const savedEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of TOUCHED_VARS) {
    savedEnv.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of TOUCHED_VARS) {
    const value = savedEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

const FLAGGER_DEFAULTS = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-haiku-4-5-20251001-v1:0",
  temperature: 0,
  maxTokens: 2048,
} as const

describe("resolveGenerationConfig", () => {
  it("returns the hardcoded defaults when nothing is set", async () => {
    const config = await Effect.runPromise(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULTS))

    expect(config).toEqual(FLAGGER_DEFAULTS)
  })

  it("omits settings the defaults don't define", async () => {
    const config = await Effect.runPromise(
      resolveGenerationConfig("TAXONOMY_NAMING", { provider: "amazon-bedrock", model: "minimax.minimax-m2.5" }),
    )

    expect(config).toEqual({ provider: "amazon-bedrock", model: "minimax.minimax-m2.5" })
    expect("temperature" in config).toBe(false)
    expect("reasoning" in config).toBe(false)
  })

  it("applies the global LAT_AI_GENERATION_* tier over the defaults", async () => {
    process.env.LAT_AI_GENERATION_PROVIDER = "openai"
    process.env.LAT_AI_GENERATION_MODEL = "gpt-5.2"
    process.env.LAT_AI_GENERATION_MAX_TOKENS = "4096"

    const config = await Effect.runPromise(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULTS))

    expect(config).toEqual({
      provider: "openai",
      model: "gpt-5.2",
      temperature: 0,
      maxTokens: 4096,
    })
  })

  it("applies the per-feature tier over the global tier", async () => {
    process.env.LAT_AI_GENERATION_PROVIDER = "openai"
    process.env.LAT_AI_GENERATION_MODEL = "gpt-5.2"
    process.env.LAT_AI_FLAGGER_CLASSIFIER_PROVIDER = "anthropic"
    process.env.LAT_AI_FLAGGER_CLASSIFIER_MODEL = "claude-haiku-4-5"
    process.env.LAT_AI_FLAGGER_CLASSIFIER_REASONING = "low"
    process.env.LAT_AI_FLAGGER_CLASSIFIER_TEMPERATURE = "0.5"

    const config = await Effect.runPromise(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULTS))

    expect(config).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      reasoning: "low",
      temperature: 0.5,
      maxTokens: 2048,
    })
  })

  it("fails with AIError on an invalid reasoning value", async () => {
    process.env.LAT_AI_FLAGGER_CLASSIFIER_REASONING = "ultra"

    await expect(
      Effect.runPromise(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULTS)),
    ).rejects.toMatchObject({ _tag: "AIError" })
  })

  it("fails with AIError on a non-numeric temperature", async () => {
    process.env.LAT_AI_GENERATION_TEMPERATURE = "warm"

    await expect(
      Effect.runPromise(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULTS)),
    ).rejects.toMatchObject({ _tag: "AIError" })
  })
})

describe("resolveEmbeddingConfig", () => {
  it("defaults to Voyage", async () => {
    const config = await Effect.runPromise(resolveEmbeddingConfig())

    expect(config).toEqual(DEFAULT_EMBEDDING_CONFIG)
  })

  it("reads the global LAT_AI_EMBEDDING_* overrides", async () => {
    process.env.LAT_AI_EMBEDDING_PROVIDER = "openai"
    process.env.LAT_AI_EMBEDDING_MODEL = "text-embedding-3-large"

    const config = await Effect.runPromise(resolveEmbeddingConfig())

    expect(config).toEqual({ provider: "openai", model: "text-embedding-3-large" })
  })
})

describe("resolveRerankingConfig", () => {
  it("defaults to Voyage", async () => {
    const config = await Effect.runPromise(resolveRerankingConfig())

    expect(config).toEqual(DEFAULT_RERANKING_CONFIG)
  })

  it("reads the global LAT_AI_RERANKING_* overrides", async () => {
    process.env.LAT_AI_RERANKING_PROVIDER = "amazon-bedrock"
    process.env.LAT_AI_RERANKING_MODEL = "cohere.rerank-v3-5:0"

    const config = await Effect.runPromise(resolveRerankingConfig())

    expect(config).toEqual({ provider: "amazon-bedrock", model: "cohere.rerank-v3-5:0" })
  })
})
