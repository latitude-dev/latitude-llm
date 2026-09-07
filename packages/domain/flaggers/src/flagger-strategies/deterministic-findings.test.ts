import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { FlaggerFindingScope } from "../entities/flagger-finding.ts"
import {
  emptyResponseStrategy,
  lowCacheHitRateStrategy,
  outputSchemaValidationStrategy,
  readDeterministicFlaggerFindings,
  toolCallErrorsStrategy,
  trashingStrategy,
} from "./index.ts"
import { assistant, assistantToolCall, makeTrace, user } from "./test-helpers.ts"

const scope = {
  organizationId: OrganizationId("a".repeat(24)),
  projectId: ProjectId("b".repeat(24)),
  sessionId: SessionId("session-1"),
} satisfies FlaggerFindingScope

const read = (
  strategy: Parameters<typeof readDeterministicFlaggerFindings>[0],
  conversation: ReturnType<typeof makeTrace>,
) => Effect.runPromise(readDeterministicFlaggerFindings(strategy, { scope, conversation }))

describe("deterministic finding readers", () => {
  it("returns unreadable when the reader's required source context is absent", async () => {
    await expect(read(emptyResponseStrategy, makeTrace([]))).resolves.toEqual({ readable: false, findings: [] })
  })

  it("returns unreadable when captured output contains no assistant turn", async () => {
    await expect(read(emptyResponseStrategy, makeTrace([user("No assistant output")]))).resolves.toEqual({
      readable: false,
      findings: [],
    })
  })

  it("returns readable with no findings when eligible source data has no issue", async () => {
    await expect(read(emptyResponseStrategy, makeTrace([user("Hi"), assistant("Hello")]))).resolves.toEqual({
      readable: true,
      findings: [],
    })
  })

  it("returns repeated-character output as an unconfirmed usability pattern", async () => {
    const result = await read(emptyResponseStrategy, makeTrace([user("Hi"), assistant("aaa")]))

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      flaggerSlug: "empty-response",
      findingKind: "unconfirmedPattern",
    })
  })

  it.each([
    {
      name: "empty response",
      strategy: emptyResponseStrategy,
      conversation: makeTrace([user("Hi"), assistant(" ")]),
      flaggerSlug: "empty-response",
      findingKind: "blank",
    },
    {
      name: "output schema damage",
      strategy: outputSchemaValidationStrategy,
      conversation: makeTrace([user("JSON please"), assistant('{"answer":"unfinished')]),
      flaggerSlug: "output-schema-validation",
      findingKind: "unclosedString",
    },
    {
      name: "thrashing",
      strategy: trashingStrategy,
      conversation: makeTrace([
        assistantToolCall("search", { q: "same" }),
        assistantToolCall("search", { q: "same" }),
        assistantToolCall("search", { q: "same" }),
      ]),
      flaggerSlug: "trashing",
      findingKind: "identicalCallLoop",
    },
    {
      name: "low cache hit rate",
      strategy: lowCacheHitRateStrategy,
      conversation: {
        ...makeTrace([user("one"), assistant("two"), user("three"), assistant("four")]),
        tokensInput: 40_000,
        tokensCacheRead: 2_000,
        tokensCacheCreate: 8_000,
      },
      flaggerSlug: "low-cache-hit-rate",
      findingKind: "lowCacheHitRate",
    },
  ])("normalizes a $name match", async ({ strategy, conversation, flaggerSlug, findingKind }) => {
    const result = await read(strategy, conversation)

    expect(result.readable).toBe(true)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      flaggerSlug,
      findingKind,
      findingKey: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it("returns every tool finding while preserving the primary discovery selection", async () => {
    const conversation = makeTrace([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-1", name: "search", arguments: { q: "first" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-1", response: { error: "timeout" } }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-2", name: "search", arguments: { q: "second" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-2", response: { ok: true } }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-2", name: "search", arguments: { q: "duplicate" } }],
      },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call-3", name: "search", arguments: { q: "third" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call-3", response: { error: "broken" } }] },
    ])

    const result = await read(toolCallErrorsStrategy, conversation)
    expect(result.readable).toBe(true)
    expect(result.findings).toHaveLength(3)
    expect(result.findings.map((finding) => finding.findingKind)).toEqual(["error", "duplicate", "error"])
    expect(result.findings[0]).toMatchObject({ findingKind: "error", recovered: true })
    expect(result.findings[2]).toMatchObject({ findingKind: "error", recovered: false })

    const selected = toolCallErrorsStrategy.selectDeterministicDiscoveryFinding?.(result.findings)
    expect(selected).toMatchObject({ findingKind: "duplicate", toolCallId: "call-2" })
  })

  it("keeps a tool finding key stable when its message position changes", async () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "tool_call" as const, id: "call-stable", name: "search", arguments: { q: "x" } }],
      },
      {
        role: "tool" as const,
        parts: [{ type: "tool_call_response" as const, id: "call-stable", response: { error: "broken" } }],
      },
    ]
    const original = await read(toolCallErrorsStrategy, makeTrace(messages))
    const shifted = await read(toolCallErrorsStrategy, makeTrace([user("Earlier context"), ...messages]))

    expect(original.findings[0]?.findingKey).toBe(shifted.findings[0]?.findingKey)
    expect(original.findings[0]).toMatchObject({ messageIndex: 0 })
    expect(shifted.findings[0]).toMatchObject({ messageIndex: 1 })
  })
})
