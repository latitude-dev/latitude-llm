import { describe, expect, it } from "vitest"

import { assistant, assistantToolCall, makeTrace, user } from "./test-helpers.ts"
import { extractToolCallSequence, findDominantToolUsage, trashingStrategy } from "./trashing.ts"

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
        expect(result.messageIndex).toBe(2)
      }
    })

    it("does not hard-match non-consecutive A-B-A-B-A repetition", () => {
      const trace = makeTrace([
        assistantToolCall("enable", { x: 1 }),
        assistantToolCall("disable", { x: 1 }),
        assistantToolCall("enable", { x: 1 }),
        assistantToolCall("disable", { x: 1 }),
        assistantToolCall("enable", { x: 1 }),
      ])

      // Oscillation is dominance-shaped suspicion: it now raises the `tool:loop`
      // hint instead of a deterministic outcome.
      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
      expect(findDominantToolUsage(extractToolCallSequence(trace))).toMatchObject({
        name: "enable",
        count: 3,
        total: 5,
      })
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
        expect(result.messageIndex).toBe(4)
      } else {
        throw new Error("expected matched")
      }
    })
  })

  describe("tool:loop dominance (one tool ≥60% of ≥5 calls, no exact-3 repeat)", () => {
    it("finds dominance at exactly 60% of 5 calls with varying args (det stays unmatched)", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a.ts" }),
        assistantToolCall("read_file", { path: "b.ts" }),
        assistantToolCall("read_file", { path: "c.ts" }),
        assistantToolCall("write_file", { path: "x.ts" }),
        assistantToolCall("write_file", { path: "y.ts" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
      expect(findDominantToolUsage(extractToolCallSequence(trace))).toMatchObject({ name: "read_file", count: 3 })
    })

    it("no dominance when total calls < 5", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a" }),
        assistantToolCall("read_file", { path: "b" }),
        assistantToolCall("read_file", { path: "c" }),
        assistantToolCall("write_file", { path: "x" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
      expect(findDominantToolUsage(extractToolCallSequence(trace))).toBeNull()
    })

    it("no dominance when no single tool reaches 60%", () => {
      const trace = makeTrace([
        assistantToolCall("read_file", { path: "a" }),
        assistantToolCall("read_file", { path: "b" }),
        assistantToolCall("write_file", { path: "x" }),
        assistantToolCall("search", { q: "y" }),
        assistantToolCall("run_tests", {}),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
      expect(findDominantToolUsage(extractToolCallSequence(trace))).toBeNull()
    })
  })

  describe("unmatched (insufficient evidence)", () => {
    it("returns unmatched when fewer than 3 tool calls", () => {
      const trace = makeTrace([assistantToolCall("search", { q: "a" }), assistantToolCall("search", { q: "b" })])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("returns unmatched for a trace with no tool calls at all", () => {
      const trace = makeTrace([user("hi"), assistant("hello")])
      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("returns unmatched when same tool but 3 distinct argument sets (narrowing search)", () => {
      const trace = makeTrace([
        assistantToolCall("search", { q: "a" }),
        assistantToolCall("search", { q: "b" }),
        assistantToolCall("search", { q: "c" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
    })

    it("returns unmatched when exact reads recur across separate work, not consecutively", () => {
      const trace = makeTrace([
        assistantToolCall("Read", { file_path: "/Users/paula/to-do/context/MARKETING-TODO.md" }),
        assistantToolCall("Write", { file_path: "/Users/paula/to-do/context/MARKETING-TODO.md", content: "initial" }),
        assistantToolCall("Read", { file_path: "/Users/paula/to-do/context/MARKETING-TODO.md" }),
        assistantToolCall("Edit", {
          file_path: "/Users/paula/to-do/context/MARKETING-TODO.md",
          old_string: "a",
          new_string: "b",
        }),
        assistantToolCall("Read", { file_path: "/Users/paula/to-do/context/MARKETING-TODO.md" }),
        assistantToolCall("Skill", { skill: "anthropic-skills:marketing-todo" }),
        assistantToolCall("Read", { file_path: "/Users/paula/to-do/context/MARKETING-TODO.md" }),
      ])

      expect(trashingStrategy.detectDeterministically?.(trace)).toEqual({ kind: "unmatched" })
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
