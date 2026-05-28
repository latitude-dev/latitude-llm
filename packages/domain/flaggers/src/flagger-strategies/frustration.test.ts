import { describe, expect, it } from "vitest"

import { frustrationStrategy } from "./frustration.ts"
import { assistant, makeTrace, user } from "./test-helpers.ts"

describe("frustrationStrategy.detectDeterministically", () => {
  describe("ambiguous on escalation patterns", () => {
    it("fires on 'speak to a human'", () => {
      const trace = makeTrace([user("This is getting nowhere. Let me speak to a human.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'talk to a real person'", () => {
      const trace = makeTrace([user("Can I talk to a real person please?")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'get me a live agent'", () => {
      const trace = makeTrace([user("Get me a live agent.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("ambiguous on restatement patterns", () => {
    it("fires on 'I already told you'", () => {
      const trace = makeTrace([user("I already told you, the deadline is Friday.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'for the third time'", () => {
      const trace = makeTrace([user("For the third time: use TypeScript.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I keep asking'", () => {
      const trace = makeTrace([user("I keep asking you to use async/await.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("ambiguous on direct dissatisfaction", () => {
    it("fires on 'you're not listening'", () => {
      const trace = makeTrace([user("You're not listening to what I'm asking for.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'you're making things up'", () => {
      const trace = makeTrace([user("You're making things up. That function doesn't exist.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'this is useless'", () => {
      const trace = makeTrace([user("This is useless.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'stop hallucinating'", () => {
      const trace = makeTrace([user("Stop hallucinating libraries that don't exist.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("ambiguous on abandonment signals", () => {
    it("fires on 'I'll do it myself'", () => {
      const trace = makeTrace([user("I'll do it myself.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'never mind'", () => {
      const trace = makeTrace([user("Never mind, forget I asked.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'forget it'", () => {
      const trace = makeTrace([user("Forget it. I'll figure it out.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("no-match", () => {
    it("no-match on a neutral request", () => {
      const trace = makeTrace([user("Can you help me draft a product spec?")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on all-caps log pastes (no frustration lexical signal)", () => {
      const trace = makeTrace([user("ERROR: UNAUTHORIZED — what does that mean?")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when frustration language appears only in an assistant message", () => {
      const trace = makeTrace([user("hi"), assistant("You're not listening — but that's okay, let's try again.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(frustrationStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("fires when frustration appears in a later user turn only", () => {
      const trace = makeTrace([
        user("Can you help me with this?"),
        assistant("Of course!"),
        user("I already told you three times — use TypeScript."),
      ])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })
})
