import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { reserveRedisBudget } from "./budget.ts"
import type { RedisClient } from "./client.ts"

const input = {
  key: "org:org-a:project:project-a:flagger-budget:2026-11-24",
  reservationId: "session-analysis",
  units: 2,
  limit: 200,
  ttlSeconds: 172800,
}

describe("reserveRedisBudget", () => {
  it.each([0, 1])("passes one key and reserves the full batch atomically: %s", async (result) => {
    let argumentsReceived: unknown[] = []
    const redis = {
      eval: async (...args: unknown[]) => {
        argumentsReceived = args
        return result
      },
    } as unknown as RedisClient

    expect(await Effect.runPromise(reserveRedisBudget(redis, input))).toBe(result === 1)
    expect(argumentsReceived.slice(1)).toEqual([1, input.key, "reservation:session-analysis", 2, 200, 172800])
  })

  it("rejects automatic work when Redis fails", async () => {
    const redis = {
      eval: async () => {
        throw new Error("unavailable")
      },
    } as unknown as RedisClient
    expect(await Effect.runPromise(reserveRedisBudget(redis, input))).toBe(false)
  })
})
