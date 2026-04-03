import { AIError, withAICache } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { CacheError } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@repo/utils", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@repo/utils")>()
  return {
    ...mod,
    hash: () => Effect.succeed("test-cache-key-hash"),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("withAICache", () => {
  it("returns AIError when cache read fails instead of crashing", async () => {
    const { ai } = createFakeAI({
      embed: () => Effect.succeed({ embedding: [1] }),
    })

    const cached = withAICache(ai, {
      get: () => Effect.fail(new CacheError({ message: "redis down", cause: new Error("ECONNREFUSED") })),
      set: () => Effect.void,
      delete: () => Effect.void,
    })

    try {
      await Effect.runPromise(cached.embed({ text: "hello", model: "m", dimensions: 1 }))
      expect.fail("expected cache read failure to yield AIError")
    } catch (err) {
      expect(err).toBeInstanceOf(AIError)
      if (err instanceof AIError) {
        expect(err.message).toContain("read")
        expect(err.httpStatus).toBe(502)
      }
    }
  })

  it("returns AIError when cache write fails after a miss", async () => {
    const { ai } = createFakeAI({
      embed: () => Effect.succeed({ embedding: [1] }),
    })

    const cached = withAICache(ai, {
      get: () => Effect.succeed(null),
      set: () => Effect.fail(new CacheError({ message: "redis write failed", cause: new Error("OOM") })),
      delete: () => Effect.void,
    })

    try {
      await Effect.runPromise(cached.embed({ text: "hello", model: "m", dimensions: 1 }))
      expect.fail("expected cache write failure to yield AIError")
    } catch (err) {
      expect(err).toBeInstanceOf(AIError)
      if (err instanceof AIError) {
        expect(err.message).toContain("write")
      }
    }
  })
})
