import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"

import { lowCacheHitRateStrategy } from "./low-cache-hit-rate.ts"
import { assistant, makeTrace, user } from "./test-helpers.ts"

type Tokens = Pick<TraceDetail, "tokensInput" | "tokensCacheRead" | "tokensCacheCreate">

const multiTurn = [user("a long first question"), assistant("a long answer"), user("a follow-up"), assistant("more")]

const makeCacheTrace = (messages: readonly TraceDetail["allMessages"][number][], tokens: Tokens): TraceDetail => ({
  ...makeTrace(messages),
  ...tokens,
})

describe("lowCacheHitRateStrategy.detectDeterministically", () => {
  describe("matched on low hit rate", () => {
    it("matches a large multi-turn trace whose cache is active but barely read", () => {
      // 4% hit rate: caching is on (8k written) but almost nothing is read back.
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 40_000,
        tokensCacheRead: 2_000,
        tokensCacheCreate: 8_000,
      })
      const result = lowCacheHitRateStrategy.detectDeterministically?.(trace)
      expect(result?.kind).toBe("matched")
      if (result?.kind === "matched") {
        expect(result.feedback).toContain("Low cache hit rate (4%)")
        expect(result.feedback).toContain("50K input tokens")
      }
    })

    it("matches at the input-volume boundary (exactly the minimum)", () => {
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 18_000,
        tokensCacheRead: 1_000,
        tokensCacheCreate: 1_000,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace).kind).toBe("matched")
    })
  })

  describe("no-match guards against false positives", () => {
    it("no-match on a single-turn trace (nothing to read back yet)", () => {
      const trace = makeCacheTrace([user("one big prompt"), assistant("answer")], {
        tokensInput: 40_000,
        tokensCacheRead: 0,
        tokensCacheCreate: 30_000,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("no-match when total input is below the minimum (caching not worth it)", () => {
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 4_000,
        tokensCacheRead: 0,
        tokensCacheCreate: 1_000,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("no-match when no cache was ever written (caching absent/unsupported)", () => {
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 50_000,
        tokensCacheRead: 0,
        tokensCacheCreate: 0,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("no-match on a healthy hit rate", () => {
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 5_000,
        tokensCacheRead: 40_000,
        tokensCacheCreate: 5_000,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("no-match exactly at the hit-rate threshold (30%)", () => {
      const trace = makeCacheTrace(multiTurn, {
        tokensInput: 60_000,
        tokensCacheRead: 30_000,
        tokensCacheCreate: 10_000,
      })
      expect(lowCacheHitRateStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("no-match on an empty trace with no tokens", () => {
      expect(lowCacheHitRateStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "unmatched" })
    })
  })

  describe("hasRequiredContext", () => {
    it("is true when there are any input-side tokens", () => {
      const trace = makeCacheTrace(multiTurn, { tokensInput: 1, tokensCacheRead: 0, tokensCacheCreate: 0 })
      expect(lowCacheHitRateStrategy.hasRequiredContext(trace)).toBe(true)
    })

    it("is false when there are no input-side tokens", () => {
      expect(lowCacheHitRateStrategy.hasRequiredContext(makeTrace([]))).toBe(false)
    })
  })
})
