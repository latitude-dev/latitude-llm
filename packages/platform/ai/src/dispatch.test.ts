import { AIEmbed, AIRerank } from "@domain/ai"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AIEmbedLive, AIRerankLive } from "./dispatch.ts"

// Routing is proven key-free: each adapter fails per call with its own
// provider-specific credential message, so the message identifies which
// adapter the dispatcher picked. Local dev shells may carry real provider
// keys — scrub them so the calls fail at credential resolution instead of
// reaching a real API.

const SCRUBBED_VARS = ["LAT_VOYAGE_API_KEY", "LAT_OPENAI_API_KEY"]
const savedEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of SCRUBBED_VARS) {
    savedEnv.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of SCRUBBED_VARS) {
    const value = savedEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

const embedInput = (provider: string) => ({
  text: "hello",
  provider,
  model: "some-model",
})

describe("AIEmbedLive dispatch", () => {
  it("routes voyage to the Voyage adapter", async () => {
    const program = Effect.gen(function* () {
      const embed = yield* AIEmbed
      return yield* embed.embed(embedInput("voyage"))
    }).pipe(Effect.provide(AIEmbedLive))

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      message: "Voyage AI is unavailable: set LAT_VOYAGE_API_KEY.",
    })
  })

  it("routes every other provider to the Vercel AI SDK adapter", async () => {
    const program = Effect.gen(function* () {
      const embed = yield* AIEmbed
      return yield* embed.embed(embedInput("openai"))
    }).pipe(Effect.provide(AIEmbedLive))

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      message: "OpenAI is unavailable: set LAT_OPENAI_API_KEY.",
    })
  })
})

describe("AIRerankLive dispatch", () => {
  it("routes voyage to the Voyage adapter", async () => {
    const program = Effect.gen(function* () {
      const rerank = yield* AIRerank
      return yield* rerank.rerank({ query: "q", documents: ["a"], provider: "voyage", model: "rerank-2.5" })
    }).pipe(Effect.provide(AIRerankLive))

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      message: "Voyage AI is unavailable: set LAT_VOYAGE_API_KEY.",
    })
  })

  it("routes unsupported providers to the Vercel adapter's clear error", async () => {
    const program = Effect.gen(function* () {
      const rerank = yield* AIRerank
      return yield* rerank.rerank({ query: "q", documents: ["a"], provider: "openai", model: "gpt-rank" })
    }).pipe(Effect.provide(AIRerankLive))

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      message: expect.stringContaining('Unsupported reranking provider "openai"'),
    })
  })
})
