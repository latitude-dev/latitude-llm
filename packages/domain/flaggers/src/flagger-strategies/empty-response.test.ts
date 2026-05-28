import { describe, expect, it } from "vitest"

import { emptyResponseStrategy } from "./empty-response.ts"
import {
  assistant,
  assistantReasoning,
  assistantReasoningAndText,
  assistantReasoningAndToolCall,
  assistantToolCall,
  assistantToolCallWithText,
  makeTrace,
  tool,
  user,
} from "./test-helpers.ts"

describe("emptyResponseStrategy.detectDeterministically", () => {
  describe("matched on empty assistant response", () => {
    it("matches empty text content", () => {
      const trace = makeTrace([user("hi"), assistant("")])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toMatchObject({
        kind: "matched",
        feedback: "Assistant response was empty or whitespace only",
      })
    })

    it("matches whitespace-only content", () => {
      const trace = makeTrace([user("hi"), assistant("   ")])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toMatchObject({
        kind: "matched",
        feedback: "Assistant response was empty or whitespace only",
      })
    })

    it("matches degenerate repeated character", () => {
      const trace = makeTrace([user("hi"), assistant("aaa")])
      const result = emptyResponseStrategy.detectDeterministically?.(trace)
      expect(result?.kind).toBe("matched")
      if (result?.kind === "matched") {
        expect(result.feedback).toContain("degenerate")
        expect(result.feedback).toContain('"a"')
      }
    })
  })

  describe("no-match on valid responses", () => {
    it("no-match on normal text response", () => {
      const trace = makeTrace([user("hi"), assistant("Hello! How can I help?")])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant only emits a tool call (no text part)", () => {
      const trace = makeTrace([user("check the weather"), assistantToolCall("get_weather", { city: "NYC" })])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant has tool call WITH empty text part", () => {
      // Regression: previously this would incorrectly match as "empty response".
      const trace = makeTrace([
        user("check the weather"),
        assistantToolCallWithText("get_weather", { city: "NYC" }, ""),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant has tool call with whitespace-only text part", () => {
      const trace = makeTrace([
        user("check the weather"),
        assistantToolCallWithText("get_weather", { city: "NYC" }, "   "),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(emptyResponseStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("no-match when the final assistant message has only reasoning (no text, no tool_call)", () => {
      const trace = makeTrace([user("solve this"), assistantReasoning("Let me think through the steps…")])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when the final assistant message has reasoning + tool_call (typical agentic step)", () => {
      const trace = makeTrace([
        user("check the weather"),
        assistantReasoningAndToolCall("Need current weather; call the tool.", "get_weather", { city: "NYC" }),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when the final assistant message has reasoning + a real text answer", () => {
      const trace = makeTrace([
        user("hi"),
        assistantReasoningAndText("They greeted me; respond warmly.", "Hello! How can I help?"),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when a reasoning-only intermediate precedes a real final text response", () => {
      const trace = makeTrace([
        user("solve this"),
        assistantReasoning("Let me think this through…"),
        assistant("Here's the answer: 42"),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when an empty-text intermediate assistant precedes a real final response", () => {
      const trace = makeTrace([
        user("hi"),
        assistant(""),
        user("did you hear me?"),
        assistant("Hello! How can I help?"),
      ])
      expect(emptyResponseStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("matches when an empty final response follows several valid tool-call iterations", () => {
      const trace = makeTrace([
        user("write a Python script"),
        assistantReasoningAndToolCall("First, read the spec.", "read_file", { path: "spec.md" }),
        tool("tc_3", { content: "spec body…" }),
        assistantReasoningAndToolCall("Now write the script.", "write_file", { path: "out.py" }),
        tool("tc_4", { ok: true }),
        assistant(""),
      ])
      const result = emptyResponseStrategy.detectDeterministically?.(trace)
      expect(result?.kind).toBe("matched")
      if (result?.kind === "matched") {
        expect(result.feedback).toBe("Assistant response was empty or whitespace only")
        // Should anchor to the final assistant turn, not an earlier reasoning step.
        expect(result.messageIndex).toBe(5)
      }
    })
  })

  describe("hasRequiredContext", () => {
    it("is true when there are output messages", () => {
      const trace = makeTrace([user("hi"), assistant("hello")])
      expect(emptyResponseStrategy.hasRequiredContext(trace)).toBe(true)
    })

    it("is false when there are no output messages", () => {
      const trace = makeTrace([])
      expect(emptyResponseStrategy.hasRequiredContext(trace)).toBe(false)
    })
  })
})
