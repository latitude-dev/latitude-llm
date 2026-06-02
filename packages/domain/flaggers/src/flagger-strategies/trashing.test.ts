import { describe, expect, it } from "vitest"

import { assistant, assistantToolCall, makeTrace, user } from "./test-helpers.ts"
import { trashingStrategy } from "./trashing.ts"

describe("trashingStrategy.detectDeterministically", () => {
  describe("matched (≥3 identical tool+args signatures)", () => {
    it("matches when the same tool+args appears exactly 3 times", () => {
      const trace = makeTrace([
        assistantToolCall("search", { q: "foo" }),
        assistantToolCall("search", { q: "foo" }),
        assistantToolCall("search", { q: "foo" }),
      ])

      const result = trashingStrategy.detectDeterministically?.(trace)
      expect(result?.kind).toBe("matched")
      if (result?.kind === "matched") {
        expect(result.feedback).toMatch(/Thrashing/)
        expect(result.feedback).toMatch(/3 times/)
      }
    })

    it("matches an A-B-A-B-A oscillation (A appears 3×)", () => {
      const trace = makeTrace([
        assistantToolCall("enable", { x: 1 }),
        assistantToolCall("disable", { x: 1 }),
        assistantToolCall("enable", { x: 1 }),
        assistantToolCall("disable", { x: 1 }),
        assistantToolCall("enable", { x: 1 }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toMatchObject({ kind: "matched" })
    })

    it("reports the actual repeat count in feedback when >3", () => {
      const trace = makeTrace([
        assistantToolCall("search", { q: "x" }),
        assistantToolCall("search", { q: "x" }),
        assistantToolCall("search", { q: "x" }),
        assistantToolCall("search", { q: "x" }),
        assistantToolCall("search", { q: "x" }),
      ])

      const result = trashingStrategy.detectDeterministically?.(trace)
      if (result?.kind === "matched") {
        expect(result.feedback).toMatch(/5 times/)
      } else {
        throw new Error("expected matched")
      }
    })
  })

  describe("ambiguous (one tool ≥60% of ≥5 calls, no exact-3 repeat)", () => {
    it("ambiguous at exactly 60% dominance of 5 calls with varying args", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a.ts" }),
        assistantToolCall("read_file", { path: "b.ts" }),
        assistantToolCall("read_file", { path: "c.ts" }),
        assistantToolCall("write_file", { path: "x.ts" }),
        assistantToolCall("write_file", { path: "y.ts" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("no-match when total calls < 5 even with high dominance", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a" }),
        assistantToolCall("read_file", { path: "b" }),
        assistantToolCall("read_file", { path: "c" }),
        assistantToolCall("write_file", { path: "x" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when no single tool reaches 60% dominance", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a" }),
        assistantToolCall("read_file", { path: "b" }),
        assistantToolCall("write_file", { path: "x" }),
        assistantToolCall("search", { q: "y" }),
        assistantToolCall("run_tests", {}),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })
  })

  describe("no-match (insufficient evidence)", () => {
    it("returns no-match when fewer than 3 tool calls", () => {
      const trace = makeTrace([assistantToolCall("search", { q: "a" }), assistantToolCall("search", { q: "b" })])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("returns no-match for a trace with no tool calls at all", () => {
      const trace = makeTrace([user("hi"), assistant("hello")])
      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("returns no-match when same tool but 3 distinct argument sets (narrowing search)", () => {
      const trace = makeTrace([
        assistantToolCall("search", { q: "a" }),
        assistantToolCall("search", { q: "b" }),
        assistantToolCall("search", { q: "c" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })
  })

  describe("hasRequiredContext", () => {
    it("is false below 3 tool calls", () => {
      const trace = makeTrace([assistantToolCall("search", { q: "a" }), assistantToolCall("search", { q: "b" })])
      expect(trashingStrategy.hasRequiredContext(trace)).toBe(false)
    })

    it("is true at exactly 3 tool calls", () => {
      const trace = makeTrace([
        assistantToolCall("search", { q: "a" }),
        assistantToolCall("search", { q: "b" }),
        assistantToolCall("search", { q: "c" }),
      ])
      expect(trashingStrategy.hasRequiredContext(trace)).toBe(true)
    })

    it("is false for a trace with only text messages", () => {
      expect(trashingStrategy.hasRequiredContext(makeTrace([user("hi"), assistant("hello")]))).toBe(false)
    })
  })
})
