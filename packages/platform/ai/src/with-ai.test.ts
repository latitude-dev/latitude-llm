import { AI, AIEmbed, AIError, AIGenerate, AIRerank, type GenerateInput } from "@domain/ai"
import type { RedisClient } from "@platform/cache-redis"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAiLayer, withAi } from "./with-ai.ts"

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
          schema: { parse: (value: unknown) => value } as never,
        }),
        ai.embed({
          text: "hello",
          model: "voyage-3-large",
          dimensions: 256,
        }),
        ai.rerank({
          query: "hello",
          documents: ["hello"],
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
      model: "voyage-3-large",
      dimensions: 256,
    } as const

    await Effect.runPromise(ai.embed(input))
    await Effect.runPromise(ai.embed(input))

    expect(embedCalls.count).toBe(1)
  })

  it("keys embed cache on inputType so document and query calls don't collide", async () => {
    const embedCalls = { count: 0 }
    const redis = createRedisClient()

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer(embedCalls), redis)))

    const base = { text: "hello", model: "voyage-4-large", dimensions: 2048 } as const

    await Effect.runPromise(ai.embed({ ...base, inputType: "document" }))
    await Effect.runPromise(ai.embed({ ...base, inputType: "query" }))

    // Different inputType → different cache key → two provider calls.
    expect(embedCalls.count).toBe(2)

    // Same inputType → cache hit, no new provider call.
    await Effect.runPromise(ai.embed({ ...base, inputType: "query" }))
    expect(embedCalls.count).toBe(2)
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
          model: "voyage-3-large",
          dimensions: 256,
        }),
      ),
    ).rejects.toMatchObject({
      _tag: "AIError",
    })
  })

  it("maps cache read failures into AIError", async () => {
    const redis = createRedisClient({
      get: async () => {
        throw new Error("ECONNREFUSED")
      },
    })

    const ai = await Effect.runPromise(getAI(createAiLayer(embedLayer({ count: 0 }), redis)))

    await expect(
      Effect.runPromise(
        ai.embed({
          text: "hello",
          model: "voyage-3-large",
          dimensions: 256,
        }),
      ),
    ).rejects.toBeInstanceOf(AIError)
  })
})
