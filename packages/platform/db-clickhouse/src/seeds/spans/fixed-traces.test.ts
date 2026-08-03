import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { buildLargeConversationSpans, buildTau2TrajectorySpans, fixedTraceSlots } from "./fixed-traces.ts"

const scope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
  apiKeyId: SEED_API_KEY_ID,
})

describe("buildLargeConversationSpans", () => {
  const sessions = [
    { sessionId: "seed-large-conversation-1", turnCount: 120, renderedMessageCount: 242 },
    { sessionId: "seed-large-conversation-2", turnCount: 240, renderedMessageCount: 482 },
    { sessionId: "seed-large-conversation-3", turnCount: 420, renderedMessageCount: 842 },
  ] as const

  it("creates deterministic trace slots for all turn and terminal spans", () => {
    const spans = buildLargeConversationSpans(scope)
    const traceIds = spans.map((span) => span.trace_id)
    const expectedTraceIds = Array.from({ length: 783 }, (_, slot) => scope.traceHex("large-conversation", slot))
    const largeConversationSlots = fixedTraceSlots.filter((slot) => slot.traceKey === "large-conversation")

    expect(spans).toHaveLength(783)
    expect(new Set(traceIds).size).toBe(783)
    expect([...traceIds].sort()).toEqual([...expectedTraceIds].sort())
    expect(buildLargeConversationSpans(scope).map((span) => span.trace_id)).toEqual(traceIds)
    expect(largeConversationSlots.map((slot) => slot.index)).toEqual(Array.from({ length: 783 }, (_, slot) => slot))
  })

  it("stores one turn per earlier trace and the full conversation on the latest terminal trace", () => {
    const spans = buildLargeConversationSpans(scope)

    for (const [sessionIndex, session] of sessions.entries()) {
      const sessionSpans = spans.filter((span) => span.session_id === session.sessionId)
      const turnSpans = sessionSpans.slice(0, -1)
      const terminalSpan = sessionSpans.at(-1)

      expect(sessionSpans).toHaveLength(session.turnCount + 1)
      expect(sessionSpans.map((span) => span.start_time)).toEqual(
        [...sessionSpans.map((span) => span.start_time)].sort(),
      )
      expect(terminalSpan?.trace_id).toBe(scope.traceHex("large-conversation", sessionIndex))

      for (const [turnIndex, span] of turnSpans.entries()) {
        const inputMessages = JSON.parse(span.input_messages)
        const outputMessages = JSON.parse(span.output_messages)

        expect(inputMessages).toHaveLength(1)
        expect(outputMessages).toHaveLength(1)
        expect(inputMessages[0]?.role).toBe("user")
        expect(outputMessages[0]?.role).toBe("assistant")
        expect(inputMessages[0]?.parts[0]?.content).toContain(`user turn ${turnIndex + 1}`)
        expect(outputMessages[0]?.parts[0]?.content).toContain(`assistant turn ${turnIndex + 1}`)
      }

      const terminalInputMessages = JSON.parse(terminalSpan?.input_messages ?? "[]")
      const terminalOutputMessages = JSON.parse(terminalSpan?.output_messages ?? "[]")
      const systemInstructions = JSON.parse(terminalSpan?.system_instructions ?? "[]")
      const turnHistory = turnSpans.flatMap((span) => [
        ...JSON.parse(span.input_messages),
        ...JSON.parse(span.output_messages),
      ])

      expect(terminalInputMessages).toEqual(turnHistory)
      expect(terminalInputMessages).toHaveLength(session.turnCount * 2)
      expect(terminalOutputMessages).toHaveLength(1)
      expect(systemInstructions.length + terminalInputMessages.length + terminalOutputMessages.length).toBe(
        session.renderedMessageCount,
      )
      expect(terminalOutputMessages[0]?.parts[0]?.content).toBe(
        `Large conversation seed ${sessionIndex + 1} final answer. This trace intentionally contains ${session.renderedMessageCount} rendered messages so the conversation drawer must page through chunks instead of returning the whole payload at once.`,
      )
    }
  })
})

describe("buildTau2TrajectorySpans message serialization", () => {
  // The trace/session rollups select messages with `input_messages != ''`, so
  // an empty list must serialize to "" (not "[]"). A leading assistant greeting
  // has no input; if it stored "[]" it would win the earliest-span tie and
  // blank out the whole trace's Input.
  it("never serializes empty message lists as '[]'", () => {
    const spans = buildTau2TrajectorySpans(scope, 50)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(span.input_messages).not.toBe("[]")
      expect(span.output_messages).not.toBe("[]")
    }
  })

  it("stores '' (not '[]') for the leading greeting span with no prior input", () => {
    const spans = buildTau2TrajectorySpans(scope, 50)
    const emptyInputChatSpans = spans.filter(
      (span) => span.operation === "chat" && span.input_messages === "" && span.output_messages !== "",
    )
    // Every tau2 trajectory opens with an assistant greeting (no input).
    expect(emptyInputChatSpans.length).toBeGreaterThan(0)
  })
})
