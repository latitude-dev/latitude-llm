import { describe, expect, it } from "vitest"
import { buildDimensionEvidence } from "./dimension-evidence.ts"

type Explanation = Parameters<typeof buildDimensionEvidence>[0]["explanation"]
type Snapshot = NonNullable<Parameters<typeof buildDimensionEvidence>[0]["snapshot"]>

const explanation = {
  window: { stepDays: 7, from: "2026-09-05T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
  eligibleSessionCount: 100,
  attribution: [],
  issues: { outcome: [], safety: { confirmedHarm: [], exposure: [] } },
  native: {
    observedCriticalPathNs: 100,
    avoidableCriticalPathNs: 20,
    costFamilyPenalties: { context: 0.25 },
  },
  coverage: {
    outcomeExaminedSessions: 0,
    safetyExaminedSessions: 20,
    reliabilityReadableSessions: 100,
    cost: {
      coverage: "unmeasured",
      families: [
        {
          family: "context",
          required: true,
          applicableReadings: 100,
          readableReadings: 40,
          coverage: 0.4,
          meetsCoverageFloor: false,
        },
      ],
      publishableSessionCount: 40,
      withheldSessionCount: 60,
      publishableSessionShare: 0.4,
    },
    speed: {
      coverage: "measured",
      completeSessionCount: 100,
      incompleteSessionCount: 0,
      completeShareOfEligible: 1,
    },
    readers: [],
  },
} as unknown as Explanation

describe("buildDimensionEvidence", () => {
  it("keeps missing coverage separate from causes", () => {
    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation })

    expect(evidence.affected).toEqual([])
    expect(evidence.coverageGaps).toEqual([
      expect.objectContaining({ label: "Sessions evaluated for outcome", value: "0%", progress: 1 }),
    ])
    expect(evidence.coverageGaps[0]).not.toHaveProperty("description")
  })

  it("keeps family summaries out of causes and unreadable cost in coverage", () => {
    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation })

    expect(evidence.affected).toEqual([])
    expect(evidence.coverageGaps.map((row) => row.label)).toEqual([
      "Sessions with usable cost data",
      "Readable model input",
    ])
  })

  it("does not describe safety exposure as confirmed harm", () => {
    const withExposure = {
      ...explanation,
      issues: {
        ...explanation.issues,
        safety: {
          confirmedHarm: [],
          exposure: [
            {
              issueKey: "prompt-injection",
              label: "Prompt injection exposure",
              signalIds: ["signal-1"],
              estimatedReach: 10,
              estimatedAdverseReach: 1,
              examinedSessions: 2,
              examinedAdverseSessions: 0,
              ranked: true,
            },
          ],
        },
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "safety", snapshot: null, explanation: withExposure })

    expect(evidence.affected).toEqual([])
    expect(evidence.context).toEqual([
      expect.objectContaining({ label: "Prompt injection exposure", value: "10 sessions" }),
    ])
  })

  it("turns internal metric identifiers and units into readable findings", () => {
    const withAttribution = {
      ...explanation,
      attribution: [
        {
          scoreDimension: "cost",
          rows: [
            {
              causeId: "tools.dead_surface",
              label: "tools.dead_surface",
              evidence: "measured",
              nativeEffect: { value: 74_952_600, unit: "context" },
              observationCount: 100,
              attributedDeficit: 5,
              fixGain: 4,
            },
          ],
          residual: 5,
          totalDeficit: 10,
          explainedDeficit: 5,
          method: "exact",
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation: withAttribution })

    expect(evidence.affected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Unused tool definitions", value: "75.0M tokens" }),
        expect.objectContaining({ label: "Other score impact", value: "5.0 score points" }),
      ]),
    )
    expect(evidence.affected[0]).toEqual(
      expect.objectContaining({
        description: "Tool definitions were sent to the model but were never used during these sessions.",
        details: [
          { label: "Scoring window", value: "Last 7 days" },
          { label: "Impact on Cost score", value: "−5.0 points" },
        ],
      }),
    )
  })

  it("explains known speed causes without exposing their machine identifiers", () => {
    const causes = ["latency:ttft+throughput", "recovered:toolFailure", "latency:throughput", "latency:ttft"]
    const withAttribution = {
      ...explanation,
      attribution: [
        {
          scoreDimension: "speed",
          rows: causes.map((causeId, index) => ({
            causeId,
            label: causeId,
            evidence: "measured",
            nativeEffect: { value: index + 1, unit: "nanoseconds" },
            observationCount: 6,
            attributedDeficit: 4 - index,
            fixGain: 4 - index,
          })),
          residual: 0,
          totalDeficit: 10,
          explainedDeficit: 10,
          method: "exact",
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "speed", snapshot: null, explanation: withAttribution })

    expect(evidence.affected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Slow initial response and generation",
          description: expect.stringContaining("both to begin responding and to generate"),
        }),
        expect.objectContaining({
          label: "Time spent recovering from tool failures",
          description: expect.stringContaining("recovered from a failed tool call"),
        }),
        expect.objectContaining({ label: "Slow response generation" }),
        expect.objectContaining({ label: "Slow initial response" }),
      ]),
    )
  })

  it("uses a diagnosis instead of observation counts as known issue detail", () => {
    const withPiiDisclosure = {
      ...explanation,
      issues: {
        ...explanation.issues,
        safety: {
          confirmedHarm: [
            {
              issueKey: "issue:safety:piiDisclosure",
              label: "PII leakage",
              signalIds: [],
              estimatedReach: 6,
              estimatedAdverseReach: 6,
              examinedSessions: 3,
              examinedAdverseSessions: 3,
              ranked: true,
            },
          ],
          exposure: [],
        },
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "safety", snapshot: null, explanation: withPiiDisclosure })

    expect(evidence.affected).toEqual([
      expect.objectContaining({
        label: "Personal information exposed",
        value: "6 sessions",
        description:
          "The agent exposed personal data in its output that the user did not provide or was not meant to receive.",
      }),
    ])
  })

  it("omits zero-impact metrics and consolidates healthy cost families", () => {
    const withHealthyMetrics = {
      ...explanation,
      native: { ...explanation.native, costFamilyPenalties: { context: 0, tools: 0 } },
      coverage: {
        ...explanation.coverage,
        cost: {
          ...explanation.coverage.cost,
          families: [
            {
              family: "context",
              required: true,
              applicableReadings: 100,
              readableReadings: 100,
              coverage: 1,
              meetsCoverageFloor: true,
            },
            {
              family: "tools",
              required: false,
              applicableReadings: 40,
              readableReadings: 40,
              coverage: 1,
              meetsCoverageFloor: true,
            },
          ],
        },
      },
      attribution: [
        {
          scoreDimension: "cost",
          rows: [
            {
              causeId: "context.redundant_input_share",
              label: "context.redundant_input_share",
              evidence: "measured",
              nativeEffect: { value: 0, unit: "context" },
              observationCount: 100,
              attributedDeficit: 0,
              fixGain: 0,
            },
            {
              causeId: "tools.thrashing",
              label: "tools.thrashing",
              evidence: "measured",
              nativeEffect: { value: 0, unit: "tools" },
              observationCount: 40,
              attributedDeficit: 0,
              fixGain: 0,
            },
          ],
          residual: 0,
          totalDeficit: 0,
          explainedDeficit: 0,
          method: "exact",
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation: withHealthyMetrics })

    expect(evidence.affected).toEqual([])
    expect(evidence.healthy).toEqual([
      expect.objectContaining({ label: "Model input and context", value: "Within healthy range" }),
      expect.objectContaining({ label: "Tool use", value: "Within healthy range" }),
    ])
  })

  it("does not round a small score-impacting amount down to zero", () => {
    const withSmallImpact = {
      ...explanation,
      attribution: [
        {
          scoreDimension: "cost",
          rows: [
            {
              causeId: "tools.repeated_call",
              label: "tools.repeated_call",
              evidence: "measured",
              nativeEffect: { value: 0.4, unit: "tools" },
              observationCount: 40,
              attributedDeficit: 0.2,
              fixGain: 0.2,
            },
          ],
          residual: 0,
          totalDeficit: 0.2,
          explainedDeficit: 0.2,
          method: "exact",
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation: withSmallImpact })

    expect(evidence.affected).toEqual([
      expect.objectContaining({ label: "Repeated tool calls", value: "0.4 call equivalents" }),
    ])
  })

  it("does not show routine sampling coverage when the score is available", () => {
    const snapshot = {
      dimensions: { outcome: { score: 70 } },
    } as unknown as Snapshot

    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot, explanation })

    expect(evidence.coverageGaps).toEqual([])
  })
})
