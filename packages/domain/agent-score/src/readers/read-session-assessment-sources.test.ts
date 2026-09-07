import type { SessionDetail } from "@domain/spans"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { readSessionAssessmentSources } from "./read-session-assessment-sources.ts"

const session = (outputMessages: SessionDetail["outputMessages"]): SessionDetail =>
  ({
    organizationId: "org-1",
    projectId: "project-1",
    sessionId: "session-1",
    traceIds: ["trace-1"],
    systemInstructions: [],
    lastInputMessages: [{ role: "user", parts: [{ type: "text", content: "Help" }] }],
    inputMessages: [],
    outputMessages,
    tags: [],
    definedTools: [],
    tokensInput: 10,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    costTotalMicrocents: 12,
    durationNs: 24,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
  }) as unknown as SessionDetail

const read = (value: SessionDetail) =>
  Effect.runPromise(
    readSessionAssessmentSources({
      session: value,
      spans: [],
      scores: [],
      signals: [],
      moments: { moments: [], labels: [] },
      screeningDecisions: [],
    }),
  )

describe("readSessionAssessmentSources", () => {
  it("normalizes blank delivered output as deterministic no-output evidence", async () => {
    const result = await read(session([{ role: "assistant", parts: [{ type: "text", content: "  " }] }]))

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "noOutput", metricId: "sessions.no_output", findingKind: "blank" }),
      ]),
    )
    expect(result.findings.some((finding) => finding.kind === "usableCompletion")).toBe(false)
    expect(result.readers.find((reader) => reader.readerId === "sessions.no_output")).toMatchObject({
      applicable: true,
      findingCount: 1,
      readableCount: 1,
    })
  })

  it("treats a tool call as delivered output without running a classifier", async () => {
    const result = await read(
      session([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call-1", name: "search", arguments: { query: "latitude" } }],
        },
      ]),
    )

    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "usableCompletion" })]))
    expect(result.findings.some((finding) => finding.kind === "noOutput")).toBe(false)
  })
})
