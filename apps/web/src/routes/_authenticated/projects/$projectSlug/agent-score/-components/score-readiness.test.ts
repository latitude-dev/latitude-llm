import { describe, expect, it } from "vitest"
import { agentScoreReadiness } from "./score-readiness.ts"

type Explanation = NonNullable<Parameters<typeof agentScoreReadiness>[0]>

const DIMENSIONS = ["outcome", "reliability", "cost", "speed", "safety"] as const

/** Every dimension measured and met, so a test only has to say what it changes. */
const explanation = (overrides: {
  readonly outcomeEvaluations?: { readonly current: number; readonly required: number }
  readonly outcomeUnmeasuredReason?: string
  readonly outcomeRequirements?: readonly unknown[]
  readonly stepDays?: number
  readonly eligibleSessionCount?: number
}): Explanation => {
  const outcomeMeasured = overrides.outcomeUnmeasuredReason === undefined

  return {
    window: { stepDays: overrides.stepDays ?? 7, from: "2026-09-05T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
    eligibleSessionCount: overrides.eligibleSessionCount ?? 2_600,
    publication: {
      status: outcomeMeasured ? "published" : "withheld",
      sessionFloor: 50,
      dimensions: DIMENSIONS.map((scoreDimension) =>
        scoreDimension === "outcome" && !outcomeMeasured
          ? { scoreDimension, coverage: "unmeasured", unmeasuredReason: overrides.outcomeUnmeasuredReason }
          : { scoreDimension, coverage: "measured" },
      ),
    },
    readiness: {
      sessionRequirement: {
        kind: "threshold",
        metric: "eligibleSessions",
        current: overrides.eligibleSessionCount ?? 2_600,
        required: 50,
        comparison: "atLeast",
        unit: "sessions",
        met: true,
      },
      dimensions: DIMENSIONS.map((scoreDimension) => ({
        scoreDimension,
        requirements:
          scoreDimension === "outcome"
            ? (overrides.outcomeRequirements ?? [
                {
                  kind: "threshold",
                  metric: "outcomeEvaluations",
                  current: overrides.outcomeEvaluations?.current ?? 75,
                  required: overrides.outcomeEvaluations?.required ?? 50,
                  comparison: "atLeast",
                  unit: "sessions",
                  met: (overrides.outcomeEvaluations?.current ?? 75) >= (overrides.outcomeEvaluations?.required ?? 50),
                },
              ])
            : [],
      })),
    },
  } as unknown as Explanation
}

const outcomeRow = (explanation: Explanation) => {
  const view = agentScoreReadiness(explanation)
  if (view.kind !== "dimensions") throw new Error(`expected dimension rows, got ${view.kind}`)
  return view.rows.find((row) => row.dimension === "outcome")
}

describe("agentScoreReadiness", () => {
  it("reports outcome ready on a large project whose judged share is far below five percent", () => {
    const row = outcomeRow(explanation({ outcomeEvaluations: { current: 75, required: 50 } }))

    expect(row).toMatchObject({ state: "ready", status: "Ready" })
    expect(row?.value).toBeUndefined()
  })

  it("shows count progress and no percentage while direct evaluations are still collecting", () => {
    const row = outcomeRow(
      explanation({ outcomeEvaluations: { current: 37, required: 50 }, outcomeUnmeasuredReason: "examinedFloor" }),
    )

    expect(row).toMatchObject({ state: "collecting", status: "Collecting direct evaluations" })
    expect(row?.value).toBe("37 / 50 evaluated")
    expect(row?.value).not.toContain("%")
  })

  // 37 verdicts per seven-day window is a level, not a running total: next week it is 37 again.
  it("offers no completion estimate, because the count does not accumulate", () => {
    const row = outcomeRow(
      explanation({
        outcomeEvaluations: { current: 37, required: 50 },
        outcomeUnmeasuredReason: "examinedFloor",
        stepDays: 7,
      }),
    )

    expect(row?.value).toBe("37 / 50 evaluated")
  })

  it("still renders an older snapshot withheld on the retired outcome share floor", () => {
    const row = outcomeRow(
      explanation({
        outcomeUnmeasuredReason: "coverageFloor",
        outcomeRequirements: [
          {
            kind: "threshold",
            metric: "outcomeEvaluations",
            current: 75,
            required: 50,
            comparison: "atLeast",
            unit: "sessions",
            met: true,
          },
          {
            kind: "threshold",
            metric: "outcomeCoverage",
            current: 0.029,
            required: 0.05,
            comparison: "atLeast",
            unit: "fraction",
            met: false,
          },
        ],
      }),
    )

    expect(row).toMatchObject({ state: "collecting", status: "Collecting evaluations" })
    expect(row?.value).toBe("2.9% / 5.0% coverage")
  })
})

describe("agentScoreReadiness speed references", () => {
  const withheldSpeed = ({
    unmeasuredReason,
    unreferencedLatencyModels,
  }: {
    readonly unmeasuredReason: string
    readonly unreferencedLatencyModels?: readonly { provider: string; model: string; sessionCount: number }[]
  }): Explanation => {
    const base = explanation({})
    return {
      ...base,
      publication: {
        ...base.publication,
        status: "withheld",
        dimensions: base.publication.dimensions.map((dimension) =>
          dimension.scoreDimension === "speed"
            ? { scoreDimension: "speed", coverage: "unmeasured", unmeasuredReason }
            : dimension,
        ),
      },
      readiness: {
        ...base.readiness,
        dimensions: base.readiness.dimensions.map((dimension) =>
          dimension.scoreDimension === "speed"
            ? {
                scoreDimension: "speed",
                requirements: [
                  {
                    kind: "threshold",
                    metric: "speedCompleteSessions",
                    current: 900,
                    required: 50,
                    comparison: "atLeast",
                    unit: "sessions",
                    met: true,
                  },
                  {
                    kind: "threshold",
                    metric: "speedCoverage",
                    current: 0.35,
                    required: 0.5,
                    comparison: "atLeast",
                    unit: "fraction",
                    met: false,
                  },
                ],
              }
            : dimension,
        ),
      },
      coverage: {
        speed: {
          coverage: "unmeasured",
          unmeasuredReason,
          completeSessionCount: 900,
          incompleteSessionCount: 1_700,
          completeShareOfEligible: 0.35,
          ...(unreferencedLatencyModels
            ? { missingLatencyReferenceSessionCount: 1_600, unreferencedLatencyModels }
            : {}),
        },
      },
    } as unknown as Explanation
  }

  const speedRow = (explanation: Explanation) => {
    const view = agentScoreReadiness(explanation)
    if (view.kind !== "dimensions") throw new Error(`expected dimension rows, got ${view.kind}`)
    return view.rows.find((row) => row.dimension === "speed")
  }

  it("names the model with no latency reference instead of asking for timing data", () => {
    const row = speedRow(
      withheldSpeed({
        unmeasuredReason: "latencyReferenceCoverage",
        unreferencedLatencyModels: [
          { provider: "anthropic", model: "claude-fable-5", sessionCount: 1_200 },
          { provider: "openai", model: "gpt-5-mini", sessionCount: 400 },
        ],
      }),
    )

    expect(row).toMatchObject({
      state: "actionNeeded",
      status: "No speed reference for claude-fable-5 and 1 more",
      value: "35.0% / 50.0% coverage",
    })
  })

  it("falls back to the generic copy on a snapshot stored before models were recorded", () => {
    const row = speedRow(withheldSpeed({ unmeasuredReason: "latencyReferenceCoverage" }))

    expect(row).toMatchObject({ status: "Needs timing data", value: "35.0% / 50.0% coverage" })
  })

  it("keeps the timing copy when reconstruction, not a reference, is what is missing", () => {
    const row = speedRow(
      withheldSpeed({
        unmeasuredReason: "completePathCoverageFloor",
        unreferencedLatencyModels: [{ provider: "openai", model: "gpt-5-mini", sessionCount: 10 }],
      }),
    )

    expect(row).toMatchObject({ status: "Needs timing data" })
  })
})
