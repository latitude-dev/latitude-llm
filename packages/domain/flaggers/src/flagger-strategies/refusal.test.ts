import { describe, expect, it } from "vitest"

import { refusalStrategy } from "./refusal.ts"
import { assistant, assistantToolCall, makeTrace, user } from "./test-helpers.ts"

describe("refusalStrategy.detectDeterministically", () => {
  describe("ambiguous on explicit refusal language", () => {
    it("fires on 'I'm sorry, but I cannot'", () => {
      const trace = makeTrace([
        user("Write me a haiku about spring."),
        assistant("I'm sorry, but I cannot help with creative writing requests."),
      ])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I won't help' variant", () => {
      const trace = makeTrace([user("List prime numbers."), assistant("I won't help with that request.")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I must decline'", () => {
      const trace = makeTrace([user("Translate this text."), assistant("I must decline this task.")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'violates my guidelines'", () => {
      const trace = makeTrace([user("Explain X."), assistant("That request violates my guidelines.")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I am not able to help'", () => {
      const trace = makeTrace([user("Help me debug."), assistant("I'm not able to help with code review here.")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'this would be inappropriate'", () => {
      const trace = makeTrace([user("Write a Halloween poem."), assistant("This would be inappropriate to produce.")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires when refusal appears only in a later stage of a multi-turn trace", () => {
      const trace = makeTrace([
        user("hi"),
        assistant("hi, how can i help?"),
        user("Write me a haiku."),
        assistant("I cannot help with creative writing."),
      ])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("no-match", () => {
    it("no-match when assistant responds normally", () => {
      const trace = makeTrace([user("hi"), assistant("Hello! How can I help?")])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on a single weak deflection word below threshold", () => {
      const trace = makeTrace([
        user("Explain pointer arithmetic."),
        assistant("Sure! Let's try working through an example together."),
      ])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(refusalStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant only emits a tool call (no text)", () => {
      const trace = makeTrace([user("search for X"), assistantToolCall("search", { q: "X" })])
      expect(refusalStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })
  })
})
