import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { describe, expect, it } from "vitest"

import { frustrationStrategy } from "./frustration.ts"
import { lazinessStrategy } from "./laziness.ts"
import { refusalStrategy } from "./refusal.ts"
import { trashingStrategy } from "./trashing.ts"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const TRACE_ID = "c".repeat(32)

type TraceMessage = TraceDetail["allMessages"][number]

const makeTrace = (allMessages: readonly TraceMessage[]): TraceDetail => ({
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  traceId: TraceId(TRACE_ID),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1,
  timeToFirstTokenNs: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  sessionId: SessionId("session-1"),
  userId: ExternalUserId("user"),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [...allMessages],
  allMessages: [...allMessages],
})

const user = (text: string): TraceMessage => ({
  role: "user",
  parts: [{ type: "text", content: text }],
})

const assistant = (text: string): TraceMessage => ({
  role: "assistant",
  parts: [{ type: "text", content: text }],
})

let toolCallCounter = 0
const assistantToolCall = (name: string, args: unknown): TraceMessage => ({
  role: "assistant",
  parts: [{ type: "tool_call", id: `tc_${++toolCallCounter}`, name, arguments: args }],
})

// ---------------------------------------------------------------------------
// Trashing
// ---------------------------------------------------------------------------

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
        expect(result.feedback).toMatch(/Trashing/i)
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
      // 3/4 = 75% dominance but only 4 calls total.
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
      // 3 calls, same tool, different args — classic narrowing-search pattern.
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

// ---------------------------------------------------------------------------
// Refusal
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Laziness
// ---------------------------------------------------------------------------

describe("lazinessStrategy.detectDeterministically", () => {
  describe("ambiguous on deferral patterns", () => {
    it("fires on 'you can try'", () => {
      const trace = makeTrace([
        user("Implement email validation."),
        assistant("You can try using a regex like /.+@.+/"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'you could try' variant", () => {
      const trace = makeTrace([user("Sort this array."), assistant("You could try Array.prototype.sort().")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'here's how you would'", () => {
      const trace = makeTrace([user("Parse JSON."), assistant("Here's how you would do it in Python: use json.loads.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'as a starting point'", () => {
      const trace = makeTrace([
        user("Write a web scraper."),
        assistant("As a starting point, install requests and beautifulsoup4."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'use this as a template'", () => {
      const trace = makeTrace([user("Write a CRUD module."), assistant("Use this as a template for your own modules.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'I'll leave'", () => {
      const trace = makeTrace([
        user("Finish the test suite."),
        assistant("I'll leave the error-case tests for you to add."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on 'refer to the docs'", () => {
      const trace = makeTrace([user("How does Promise.all work?"), assistant("Refer to the docs for details.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// TODO' placeholder comment", () => {
      const trace = makeTrace([
        user("Write the auth middleware."),
        assistant("```ts\nexport function auth() {\n  // TODO: implement\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// FIXME'", () => {
      const trace = makeTrace([
        user("Fix the bug."),
        assistant("```ts\nfunction process() {\n  // FIXME: handle null\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '// your code here'", () => {
      const trace = makeTrace([
        user("Implement the function."),
        assistant("```ts\nfunction foo() {\n  // your code here\n}\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '# TODO' python comment", () => {
      const trace = makeTrace([
        user("Write a fib function."),
        assistant("```py\ndef fib(n):\n    # TODO: implement\n```"),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires on '... etc.' trailing pattern", () => {
      const trace = makeTrace([
        user("List all HTTP status codes."),
        assistant("200 OK, 404 Not Found, 500 Server Error ... etc."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("is case-insensitive", () => {
      const trace = makeTrace([user("Write the code."), assistant("HERE'S HOW YOU WOULD approach this.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })

    it("fires when deferral phrase appears only in a later stage", () => {
      const trace = makeTrace([
        user("hello"),
        assistant("hi!"),
        user("Write the function."),
        assistant("Here's how you would implement it: ..."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })

  describe("no-match", () => {
    it("no-match when the assistant gives a substantive answer", () => {
      const trace = makeTrace([user("What's the capital of France?"), assistant("The capital of France is Paris.")])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(lazinessStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("no-match when assistant only emits a tool call (no text to match against)", () => {
      const trace = makeTrace([user("search for pizza recipes"), assistantToolCall("search", { q: "pizza" })])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match when an unrelated 'could' appears without deferral context", () => {
      // "could be" / "could go" are not matched — only the punt-phrase shapes.
      const trace = makeTrace([
        user("Is this approach correct?"),
        assistant("Yes, this approach could be called memoization."),
      ])
      expect(lazinessStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })
  })
})

// ---------------------------------------------------------------------------
// Frustration
// ---------------------------------------------------------------------------

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
      // Only user text is checked; assistant saying "you're not listening" doesn't count.
      const trace = makeTrace([user("hi"), assistant("You're not listening — but that's okay, let's try again.")])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "no-match" })
    })

    it("no-match on empty conversation", () => {
      expect(frustrationStrategy.detectDeterministically?.(makeTrace([]))).toEqual({ kind: "no-match" })
    })

    it("fires when frustration appears in a later user turn only", () => {
      // Multi-turn: earlier turn is neutral, later one is explicit frustration.
      const trace = makeTrace([
        user("Can you help me with this?"),
        assistant("Of course!"),
        user("I already told you three times — use TypeScript."),
      ])
      expect(frustrationStrategy.detectDeterministically?.(trace)).toEqual({ kind: "ambiguous" })
    })
  })
})
