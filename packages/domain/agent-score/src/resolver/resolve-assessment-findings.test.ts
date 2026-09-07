import { describe, expect, it } from "vitest"
import type { AssessmentFinding } from "../entities/session-assessment-input.ts"
import { resolveAssessmentFinding, resolveSessionAssessmentItems } from "./resolve-assessment-findings.ts"

const base = {
  evidenceKey: "finding-1",
  label: "Provider failed once",
  source: "metric" as const,
  metricId: "spans.provider_error",
  signalIds: ["signal-1"],
  scoreIds: ["score-1"],
  occurrenceCount: 1,
  chronology: { occurredAt: new Date("2026-01-01T00:00:01.000Z") },
  anchors: [{ kind: "span" as const, traceId: "trace-1", spanId: "span-1" }],
  destinations: [{ kind: "span" as const, traceId: "trace-1", spanId: "span-1" }],
  independentHumanEvidence: false,
}

describe("assessment finding resolver", () => {
  it("maps one recovered provider fact to reliability, cost, and speed effects", () => {
    const resolved = resolveAssessmentFinding({
      ...base,
      kind: "providerError",
      findingKind: "rateLimit",
      recovered: true,
      sameSubjectRecovered: true,
      terminal: false,
      observedMicrocents: 20,
      observedNs: 1_000,
    })

    expect(resolved.item.effects).toEqual([
      expect.objectContaining({ scoreDimension: "reliability", direction: "context", measurement: "observed" }),
      expect.objectContaining({ scoreDimension: "cost", direction: "negative", measurement: "observed" }),
      expect.objectContaining({ scoreDimension: "speed", direction: "negative", measurement: "observed" }),
    ])
    expect(resolved.item.destinations).toEqual(base.destinations)
  })

  it("does not turn an unconfirmed output pattern into terminal failure", () => {
    const resolved = resolveAssessmentFinding({
      ...base,
      kind: "noOutput",
      findingKind: "unconfirmedPattern",
    })

    expect(resolved.item.effects).toEqual([
      expect.objectContaining({
        scoreDimension: "outcome",
        direction: "context",
        measurement: "notMeasured",
        benchmarkUse: "modeled",
      }),
    ])
  })

  it("orders timed facts first, then message-only and session-wide facts", () => {
    const finding = (evidenceKey: string, chronology: AssessmentFinding["chronology"]): AssessmentFinding => ({
      ...base,
      evidenceKey,
      chronology,
      kind: "standaloneScore",
      negative: false,
    })

    expect(
      resolveSessionAssessmentItems([
        finding("session-wide", {}),
        finding("message", { messageIndex: 2 }),
        finding("later", { occurredAt: new Date("2026-01-01T00:00:02.000Z") }),
        finding("earlier", { occurredAt: new Date("2026-01-01T00:00:01.000Z") }),
      ]).map((item) => item.evidenceKey),
    ).toEqual(["earlier", "later", "message", "session-wide"])
  })

  it("merges metric, discovery score, and assigned signal by underlying evidence key", () => {
    const metric: AssessmentFinding = {
      ...base,
      evidenceKey: "shared-fact",
      signalIds: [],
      scoreIds: [],
      occurrenceCount: 3,
      kind: "toolRepetition",
      redundancy: "unconfirmed",
    }
    const signal: AssessmentFinding = {
      ...base,
      evidenceKey: "shared-fact",
      label: "Repeated searches",
      source: "signal",
      signalIds: ["signal-1", "signal-2"],
      scoreIds: ["score-1"],
      occurrenceCount: 1,
      kind: "classifiedJudgment",
      roles: [
        { scoreDimension: "cost", role: "spendEfficiency" },
        { scoreDimension: "speed", role: "criticalPathEfficiency" },
      ],
      negative: true,
    }

    const items = resolveSessionAssessmentItems([metric, signal])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      evidenceKey: "shared-fact",
      source: "metric",
      metricId: "spans.provider_error",
      signalIds: ["signal-1", "signal-2"],
      scoreIds: ["score-1"],
      occurrenceCount: 3,
    })
    expect(items[0]?.effects).toHaveLength(2)
  })

  it("keeps independent human evidence separate from an automatic observation", () => {
    const automatic: AssessmentFinding = {
      ...base,
      evidenceKey: "shared-fact",
      kind: "standaloneScore",
      negative: true,
    }
    const human: AssessmentFinding = {
      ...automatic,
      source: "score",
      scoreIds: ["human-score"],
      independentHumanEvidence: true,
    }

    const items = resolveSessionAssessmentItems([automatic, human])

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.id)).toEqual(["shared-fact", "human:human-score"])
  })
})
