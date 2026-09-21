import { describe, expect, it } from "vitest"
import { buildDimensionEvidence } from "./dimension-evidence.ts"

type Explanation = Parameters<typeof buildDimensionEvidence>[0]["explanation"]
type Snapshot = NonNullable<Parameters<typeof buildDimensionEvidence>[0]["snapshot"]>

const explanation = {
  window: { stepDays: 7, from: "2026-09-05T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
  eligibleSessionCount: 100,
  publication: { status: "published", sessionFloor: 200, dimensions: [] },
  attribution: [],
  observedCauses: [],
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
  readiness: {
    sessionRequirement: {},
    dimensions: [
      {
        scoreDimension: "outcome",
        requirements: [{ kind: "threshold", metric: "outcomeEvaluations", current: 0, required: 50, met: false }],
      },
    ],
  },
} as unknown as Explanation

const withOutcomeEvaluations = (current: number) => ({
  readiness: {
    sessionRequirement: {},
    dimensions: [
      {
        scoreDimension: "outcome",
        requirements: [{ kind: "threshold", metric: "outcomeEvaluations", current, required: 50, met: true }],
      },
    ],
  },
})

/** An explanation stored before either the judged count or the readiness row existed. */
const withoutJudgedCount = { readiness: { sessionRequirement: {}, dimensions: [] } }

describe("buildDimensionEvidence", () => {
  it("keeps missing coverage separate from causes", () => {
    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation })

    expect(evidence.affected).toEqual([])
    expect(evidence.coverageGaps).toEqual([
      expect.objectContaining({ label: "Sessions directly evaluated for outcome", value: "0%", progress: 1 }),
    ])
    expect(evidence.coverageGaps[0]).not.toHaveProperty("description")
  })

  it("counts the judged sample rather than the census in the outcome coverage row", () => {
    const evidence = buildDimensionEvidence({
      dimension: "outcome",
      snapshot: null,
      explanation: {
        ...explanation,
        coverage: { ...explanation.coverage, outcomeExaminedSessions: 90, outcomeSampledSessions: 75 },
      } as unknown as Explanation,
    })

    expect(evidence.coverageGaps[0]).toMatchObject({ value: "75%" })
  })

  it("reads the judged sample off readiness when coverage does not report it", () => {
    const evidence = buildDimensionEvidence({
      dimension: "outcome",
      snapshot: null,
      explanation: {
        ...explanation,
        coverage: { ...explanation.coverage, outcomeExaminedSessions: 90 },
        ...withOutcomeEvaluations(75),
      } as unknown as Explanation,
    })

    expect(evidence.coverageGaps[0]).toMatchObject({
      label: "Sessions directly evaluated for outcome",
      value: "75%",
    })
  })

  it("stops claiming direct evaluation when no judged count can be recovered", () => {
    const evidence = buildDimensionEvidence({
      dimension: "outcome",
      snapshot: null,
      explanation: {
        ...explanation,
        coverage: { ...explanation.coverage, outcomeExaminedSessions: 90 },
        ...withoutJudgedCount,
      } as unknown as Explanation,
    })

    expect(evidence.coverageGaps[0]).toMatchObject({ label: "Sessions evaluated for outcome", value: "90%" })
  })

  it("reports the judged sample as context once outcome has published", () => {
    const evidence = buildDimensionEvidence({
      dimension: "outcome",
      snapshot: { dimensions: { outcome: { score: 88 } } } as unknown as Snapshot,
      explanation: {
        ...explanation,
        eligibleSessionCount: 2_600,
        coverage: { ...explanation.coverage, outcomeExaminedSessions: 90, outcomeSampledSessions: 75 },
      } as unknown as Explanation,
    })

    expect(evidence.coverageGaps).toEqual([])
    expect(evidence.context).toContainEqual(
      expect.objectContaining({
        id: "outcome:direct-evaluations",
        label: "Sessions directly evaluated for outcome",
        value: "75 of 2,600",
      }),
    )
  })

  it("counts only the judged sample in the published context row, never the census", () => {
    const published = (coverage: object, readiness: object) =>
      buildDimensionEvidence({
        dimension: "outcome",
        snapshot: { dimensions: { outcome: { score: 88 } } } as unknown as Snapshot,
        explanation: {
          ...explanation,
          eligibleSessionCount: 2_600,
          coverage: { ...explanation.coverage, ...coverage },
          ...readiness,
        } as unknown as Explanation,
      })

    const recovered = published({ outcomeExaminedSessions: 90 }, withOutcomeEvaluations(75))
    expect(recovered.context).toContainEqual(expect.objectContaining({ value: "75 of 2,600" }))

    const unrecoverable = published({ outcomeExaminedSessions: 90 }, withoutJudgedCount)
    expect(unrecoverable.context).not.toContainEqual(expect.objectContaining({ id: "outcome:direct-evaluations" }))
  })

  it("survives an explanation stored without a readiness block", () => {
    const { readiness: _readiness, ...withoutReadiness } = explanation as Record<string, unknown>

    expect(() =>
      buildDimensionEvidence({
        dimension: "outcome",
        snapshot: { dimensions: { outcome: { score: 88 } } } as unknown as Snapshot,
        explanation: withoutReadiness as unknown as Explanation,
      }),
    ).not.toThrow()
  })

  it("keeps family summaries out of causes and unreadable cost in coverage", () => {
    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation })

    expect(evidence.affected).toEqual([])
    expect(evidence.coverageGaps.map((row) => row.label)).toEqual([
      "Sessions with usable cost data",
      "Readable model input",
    ])
  })

  it("lists observed causes when score publication is withheld", () => {
    const withheld = {
      ...explanation,
      publication: {
        status: "withheld",
        reason: "sessionFloor",
        sessionFloor: 200,
        dimensions: [],
      },
      observedCauses: [
        {
          scoreDimension: "cost",
          causeId: "tools.repeated_call",
          label: "tools.repeated_call",
          measurement: "measured",
          nativeEffect: { value: 0.4, unit: "tools" },
          observationCount: 1,
          destination: "tools",
        },
        {
          scoreDimension: "cost",
          causeId: "signal:signal-1",
          label: "Repeated answers",
          measurement: "notMeasured",
          nativeEffect: { value: 1, unit: "sessions" },
          observationCount: 1,
          signalId: "signal-1",
          destination: "signals",
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation: withheld })

    expect(evidence.affected).toEqual([
      expect.objectContaining({ label: "Repeated tool calls", value: "0.4 call equivalents" }),
    ])
    expect(evidence.context).toEqual([expect.objectContaining({ label: "Repeated answers", value: "1 session" })])
  })

  it("carries the example sessions an Outcome issue was built from", () => {
    const withIssues = {
      ...explanation,
      issues: {
        ...explanation.issues,
        outcome: [
          {
            issueKey: "issue:no-output",
            label: "sessions.no_output",
            signalIds: [],
            examinedSessions: 4,
            examinedAdverseSessions: 4,
            ranked: false,
            exampleSessionIds: ["session-a", "session-b"],
          },
        ],
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation: withIssues })

    // No signal to open, so the ids are the only route from the row to the sessions behind it.
    expect(evidence.affected).toEqual([
      expect.objectContaining({ label: "No output", exampleSessionIds: ["session-a", "session-b"] }),
    ])
  })

  it("shows only the session count actually observed when reach is estimated", () => {
    const withSampledIssue = {
      ...explanation,
      issues: {
        ...explanation.issues,
        outcome: [
          {
            issueKey: "issue:sampled",
            label: "Sampled issue",
            signalIds: [],
            estimatedReach: 100,
            estimatedAdverseReach: 100,
            examinedSessions: 10,
            examinedAdverseSessions: 10,
            ranked: true,
            exampleSessionIds: ["session-a"],
          },
        ],
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation: withSampledIssue })

    expect(evidence.affected).toEqual([expect.objectContaining({ value: "10 sessions" })])
  })

  it("shows the session count when estimated and observed reach agree", () => {
    const withCensusIssue = {
      ...explanation,
      issues: {
        ...explanation.issues,
        outcome: [
          {
            issueKey: "issue:census",
            label: "Census issue",
            signalIds: [],
            estimatedReach: 10,
            estimatedAdverseReach: 10,
            examinedSessions: 10,
            examinedAdverseSessions: 10,
            ranked: true,
            exampleSessionIds: ["session-a"],
          },
        ],
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation: withCensusIssue })

    expect(evidence.affected).toEqual([expect.objectContaining({ value: "10 sessions" })])
  })

  it("shows the session count when estimated reach rounds to the observed count", () => {
    const withRoundedEstimate = {
      ...explanation,
      issues: {
        ...explanation.issues,
        outcome: [
          {
            issueKey: "issue:rounded-estimate",
            label: "Rounded estimate",
            signalIds: [],
            estimatedReach: 10.2,
            estimatedAdverseReach: 10.2,
            examinedSessions: 10,
            examinedAdverseSessions: 10,
            ranked: true,
            exampleSessionIds: ["session-a"],
          },
        ],
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation: withRoundedEstimate })

    expect(evidence.affected).toEqual([expect.objectContaining({ value: "10 sessions" })])
  })

  it("carries the example sessions a Reliability cause ended", () => {
    const withheld = {
      ...explanation,
      publication: { status: "withheld", reason: "sessionFloor", sessionFloor: 200, dimensions: [] },
      observedCauses: [
        {
          scoreDimension: "reliability",
          causeId: "noOutput",
          label: "noOutput",
          measurement: "measured",
          nativeEffect: { value: 4, unit: "sessions" },
          observationCount: 4,
          destination: "sessions",
          exampleSessionIds: ["session-a"],
        },
      ],
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "reliability", snapshot: null, explanation: withheld })

    expect(evidence.affected).toEqual([
      expect.objectContaining({ label: "No output", value: "4 sessions", exampleSessionIds: ["session-a"] }),
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
      expect.objectContaining({ label: "Prompt injection exposure", value: "2 sessions" }),
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
        expect.objectContaining({ label: "Other score impact", value: "5.0 score points", valueKind: "scorePoints" }),
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
        value: "3 sessions",
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
