import { AI, AIEmbed, AIGenerate, AIRerank, type GenerateInput } from "@domain/ai"
import type { RedisClient } from "@platform/cache-redis"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAiLayer, withAi } from "./with-ai.ts"

silenceLoggerInTests()

beforeEach(() => {
  vi.clearAllMocks()
})

const generateLayer = (calls: { count: number }) =>
  Layer.succeed(AIGenerate, {
    generate: <T>(_input: GenerateInput<T>) => {
      calls.count += 1
      return Effect.succeed({
        object: {} as T,
        tokens: 0,
        duration: 0,
      })
    },
  })

const embedLayer = (calls: { count: number }, embedding: readonly number[] = [3, 4]) =>
  Layer.succeed(AIEmbed, {
    embed: () => {
      calls.count += 1
      return Effect.succeed({ embedding: [...embedding] })
    },
  })

const rerankLayer = (calls: { count: number }) =>
  Layer.succeed(AIRerank, {
    rerank: () => {
      calls.count += 1
      return Effect.succeed([{ index: 0, relevanceScore: 1 }])
    },
  })

const getAI = (layer: Layer.Layer<AI, never, never>) =>
  Effect.gen(function* () {
    return yield* AI
  }).pipe(Effect.provide(layer))

const createRedisClient = ({
  get,
  set,
  del,
}: {
  get?: (key: string) => Promise<string | null>
  set?: (key: string, value: string, mode?: string, ttlSeconds?: number) => Promise<unknown>
  del?: (key: string) => Promise<number>
} = {}) => {
  const store = new Map<string, string>()

  return {
    get:
      get ??
      vi.fn(async (key: string) => {
        return store.get(key) ?? null
      }),
    set:
      set ??
      vi.fn(async (key: string, value: string) => {
        store.set(key, value)
        return "OK"
      }),
    del:
      del ??
      vi.fn(async (key: string) => {
        const deleted = store.delete(key)
        return deleted ? 1 : 0
      }),
  } as unknown as RedisClient
}

describe("createAiLayer", () => {
  it("routes each capability to the configured adapter", async () => {
    const generateCalls = { count: 0 }
    const embedCalls = { count: 0 }
    const rerankCalls = { count: 0 }

    const ai = await Effect.runPromise(
      getAI(
        createAiLayer(Layer.mergeAll(generateLayer(generateCalls), embedLayer(embedCalls), rerankLayer(rerankCalls))),
      ),
    )

    await Effect.runPromise(
      Effect.all([
        ai.generate({
          provider: "openai",
          model: "gpt-5",
          system: "system",
          prompt: "prompt",
          schema: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
        }),
        ai.embed({
          text: "hello",
          provider: "voyage",
          model: "voyage-3-large",
        }),
        ai.rerank({
          query: "hello",
          documents: ["hello"],
          provider: "voyage",
          model: "rerank-2",
        }),
      ]),
    )

    expect(generateCalls.count).toBe(1)
    expect(embedCalls.count).toBe(1)
    expect(rerankCalls.count).toBe(1)
  })

  it("caches repeated calls when redisClient is provided", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    const input = {
      text: "hello",
      provider: "voyage",
      model: "voyage-3-large",
    } as const

    await Effect.runPromise(ai.embed(input))
    await Effect.runPromise(ai.embed(input))

    expect(embedCalls.count).toBe(1)
  })

  it("keys embed cache on inputType so document and query calls don't collide", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    const base = { text: "hello", provider: "voyage", model: "voyage-4-large" } as const

    await Effect.runPromise(ai.embed({ ...base, inputType: "document" }))
    await Effect.runPromise(ai.embed({ ...base, inputType: "query" }))

    // Different inputType → different cache key → two provider calls.
    expect(embedCalls.count).toBe(2)

    // Same inputType → cache hit, no new provider call.
    await Effect.runPromise(ai.embed({ ...base, inputType: "query" }))
    expect(embedCalls.count).toBe(2)
  })

  it("keys embed cache on provider and model so LAT_AI_* overrides never replay stale vectors", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    await Effect.runPromise(ai.embed({ text: "hello", provider: "voyage", model: "voyage-4-large" }))
    await Effect.runPromise(ai.embed({ text: "hello", provider: "openai", model: "voyage-4-large" }))
    await Effect.runPromise(ai.embed({ text: "hello", provider: "openai", model: "text-embedding-3-large" }))

    // Different provider or model → different cache key → three provider calls.
    expect(embedCalls.count).toBe(3)

    await Effect.runPromise(ai.embed({ text: "hello", provider: "voyage", model: "voyage-4-large" }))
    expect(embedCalls.count).toBe(3)
  })

  it("hashes cache keys independently of property construction order", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    await Effect.runPromise(ai.embed({ text: "hello", provider: "voyage", model: "voyage-4-large" }))
    await Effect.runPromise(ai.embed({ model: "voyage-4-large", provider: "voyage", text: "hello" }))

    expect(embedCalls.count).toBe(1)
  })

  it("caches generate keyed on the resolved provider/model and settings", async () => {
    const generateCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(generateLayer(generateCalls), redis)))

    const base = {
      system: "system",
      prompt: "prompt",
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
    }

    await Effect.runPromise(ai.generate({ ...base, provider: "amazon-bedrock", model: "minimax.minimax-m2.5" }))
    await Effect.runPromise(ai.generate({ ...base, provider: "amazon-bedrock", model: "minimax.minimax-m2.5" }))
    expect(generateCalls.count).toBe(1)

    // Provider/model/settings overrides bust the key.
    await Effect.runPromise(ai.generate({ ...base, provider: "custom", model: "minimax.minimax-m2.5" }))
    await Effect.runPromise(
      ai.generate({ ...base, provider: "amazon-bedrock", model: "minimax.minimax-m2.5", temperature: 0.5 }),
    )
    expect(generateCalls.count).toBe(3)
  })

  it("keeps the served model on a cached generate result so a cache hit prices the same as the miss", async () => {
    const redis = createRedisClient()
    const generateCalls = { count: 0 }
    const servedBy = { provider: "amazon-bedrock", model: "openai.gpt-oss-120b-1:0" } as const
    const layer = Layer.succeed(AIGenerate, {
      generate: <T>(_input: GenerateInput<T>) => {
        generateCalls.count += 1
        return Effect.succeed({ object: {} as T, tokens: 3, duration: 1, servedBy })
      },
    })

    const ai = await Effect.runPromise(getAI(createAiLayer(layer, redis)))
    const input = {
      provider: "amazon-bedrock",
      model: "minimax.minimax-m2.5",
      system: "system",
      prompt: "prompt",
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
    } as const

    const miss = await Effect.runPromise(ai.generate(input))
    expect(generateCalls.count).toBe(1)

    const hit = await Effect.runPromise(ai.generate(input))
    // Still 1, so `hit` came back through the cache's encode/decode rather than the provider.
    expect(generateCalls.count).toBe(1)

    expect(miss.servedBy).toEqual(servedBy)
    expect(hit.servedBy).toEqual(servedBy)
  })

  it("caches rerank keyed on provider, model, query, and documents", async () => {
    const rerankCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(rerankLayer(rerankCalls), redis)))

    const base = { query: "hello", documents: ["a", "b"] as const }

    await Effect.runPromise(ai.rerank({ ...base, provider: "voyage", model: "rerank-2.5" }))
    await Effect.runPromise(ai.rerank({ ...base, provider: "voyage", model: "rerank-2.5" }))
    expect(rerankCalls.count).toBe(1)

    await Effect.runPromise(ai.rerank({ ...base, provider: "amazon-bedrock", model: "cohere.rerank-v3-5:0" }))
    expect(rerankCalls.count).toBe(2)
  })

  it("scopes cache keys by organization without changing same-organization cache hits", async () => {
    const embedCalls = { count: 0 }
    const keys: string[] = []
    const values = new Map<string, string>()
    const redis = createRedisClient({
      get: async (key) => {
        keys.push(key)
        return values.get(key) ?? null
      },
      set: async (key, value) => {
        keys.push(key)
        values.set(key, value)
      },
    })
    const input = { text: "hello", provider: "voyage", model: "voyage-4-large" } as const
    const orgOne = await Effect.runPromise(
      getAI(createAiLayer(embedLayer(embedCalls), redis, { organizationId: "one" })),
    )
    const orgOneAgain = await Effect.runPromise(
      getAI(createAiLayer(embedLayer(embedCalls), redis, { organizationId: "one" })),
    )
    const orgTwo = await Effect.runPromise(
      getAI(createAiLayer(embedLayer(embedCalls), redis, { organizationId: "two" })),
    )

    await Effect.runPromise(orgOne.embed(input))
    await Effect.runPromise(orgOneAgain.embed(input))
    await Effect.runPromise(orgTwo.embed(input))

    expect(embedCalls.count).toBe(2)
    expect(keys.some((key) => key.startsWith("org:one:ai:"))).toBe(true)
    expect(keys.some((key) => key.startsWith("org:two:ai:"))).toBe(true)
  })

  it("does not cache provider generate results that fail the requested schema", async () => {
    const calls = { count: 0 }
    const writes: string[] = []
    const redis = createRedisClient({
      set: async (key) => {
        writes.push(key)
      },
    })
    const ai = await Effect.runPromise(
      getAI(
        createAiLayer(
          Layer.succeed(AIGenerate, {
            generate: <T>() => {
              calls.count += 1
              return Effect.succeed({ object: {} as T, tokens: 0, duration: 0 })
            },
          }),
          redis,
        ),
      ),
    )
    const input = {
      provider: "openai",
      model: "gpt-5",
      system: "system",
      prompt: "prompt",
      schema: {
        safeParse: (value: unknown) =>
          typeof (value as { answer?: unknown }).answer === "string"
            ? { success: true, data: value }
            : { success: false, error: new Error("answer is required") },
      } as never,
    }

    await expect(Effect.runPromise(ai.generate(input))).rejects.toMatchObject({ _tag: "AIError" })
    await expect(Effect.runPromise(ai.generate(input))).rejects.toMatchObject({ _tag: "AIError" })

    expect(calls.count).toBe(2)
    expect(writes).toHaveLength(0)
  })

  it("discards invalid cached generate output and refetches it", async () => {
    const calls = { count: 0 }
    const deletes: string[] = []
    const redis = createRedisClient({
      get: async () => JSON.stringify({ object: {}, tokens: 0, duration: 0 }),
      del: async (key) => {
        deletes.push(key)
        return 1
      },
    })
    const ai = await Effect.runPromise(
      getAI(
        createAiLayer(
          Layer.succeed(AIGenerate, {
            generate: <T>() => {
              calls.count += 1
              return Effect.succeed({ object: { answer: "ok" } as T, tokens: 0, duration: 0 })
            },
          }),
          redis,
        ),
      ),
    )
    const input = {
      provider: "openai",
      model: "gpt-5",
      system: "system",
      prompt: "prompt",
      schema: {
        safeParse: (value: unknown) =>
          typeof (value as { answer?: unknown }).answer === "string"
            ? { success: true, data: value }
            : { success: false, error: new Error("answer is required") },
      } as never,
    }

    await Effect.runPromise(ai.generate(input))
    await Effect.runPromise(ai.generate(input))

    expect(calls.count).toBe(2)
    expect(deletes).toHaveLength(2)
  })
})

describe("withAi", () => {
  it("returns a pipe-compatible provider and preserves missing-capability failures", async () => {
    const ai = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* AI
      }).pipe(withAi(generateLayer({ count: 0 }))),
    )

    await expect(
      Effect.runPromise(
        ai.embed({
          text: "hello",
          provider: "voyage",
          model: "voyage-3-large",
        }),
      ),
    ).rejects.toMatchObject({
      _tag: "AIError",
    })
  })

  it("treats cache read failures as a cache miss", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient({
      get: async () => {
        throw new Error("ECONNREFUSED")
      },
    })

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    await expect(
      Effect.runPromise(
        ai.embed({
          text: "hello",
          provider: "voyage",
          model: "voyage-3-large",
        }),
      ),
    ).resolves.toEqual({ embedding: [3, 4] })

    expect(embedCalls.count).toBe(1)
  })

  it("ignores cache write failures after a successful provider call", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient({
      set: async () => {
        throw new Error("ECONNREFUSED")
      },
    })

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    await expect(
      Effect.runPromise(
        ai.embed({
          text: "hello",
          provider: "voyage",
          model: "voyage-3-large",
        }),
      ),
    ).resolves.toEqual({ embedding: [3, 4] })

    expect(embedCalls.count).toBe(1)
  })
})
