import type { AIShape, GenerateInput, GenerateResult } from "@domain/ai"
import type { CacheStoreShape } from "@platform/cache-redis"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { withAICache } from "./cache.ts"

const schema = z.object({ matched: z.boolean() })

const createCacheStore = () => {
  const entries = new Map<string, string>()
  const store: CacheStoreShape = {
    get: (key) => Effect.succeed(entries.get(key) ?? null),
    set: (key, value) => Effect.sync(() => void entries.set(key, value)),
    delete: (key) => Effect.sync(() => void entries.delete(key)),
  }
  return { store, entries }
}

const createAi = (result: GenerateResult<unknown>) => {
  let calls = 0
  const ai = {
    generate: <T>(_input: GenerateInput<T>) => {
      calls += 1
      return Effect.succeed(result as GenerateResult<T>)
    },
    embed: () => Effect.die("Unexpected embed"),
    rerank: () => Effect.die("Unexpected rerank"),
  } as unknown as AIShape
  return { ai, callCount: () => calls }
}

const generateInput: GenerateInput<z.infer<typeof schema>> = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-sonnet-4-6",
  system: "classify",
  prompt: "is this a refusal?",
  schema,
}

describe("withAICache generate", () => {
  it("passes the provider's telemetry trace id through on a miss", async () => {
    const { store } = createCacheStore()
    const { ai } = createAi({ object: { matched: true }, tokens: 1, duration: 1, telemetryTraceId: "a".repeat(32) })

    const result = await Effect.runPromise(withAICache(ai, store).generate(generateInput))

    expect(result.telemetryTraceId).toBe("a".repeat(32))
  })

  it("never serves a trace id from the cache", async () => {
    const { store, entries } = createCacheStore()
    const { ai, callCount } = createAi({
      object: { matched: true },
      tokens: 1,
      duration: 1,
      telemetryTraceId: "a".repeat(32),
    })
    const cached = withAICache(ai, store)

    await Effect.runPromise(cached.generate(generateInput))
    const hit = await Effect.runPromise(cached.generate(generateInput))

    // A cache hit creates no span, so a stored id would point at the first
    // caller's trace and the verdict would land on an unrelated generation.
    expect(callCount()).toBe(1)
    expect(hit.telemetryTraceId).toBeUndefined()
    expect([...entries.values()].join()).not.toContain("a".repeat(32))
  })
})
