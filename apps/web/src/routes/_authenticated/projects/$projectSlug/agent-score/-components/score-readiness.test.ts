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
  /**
   * The shape this change exists for: 75 verdicts out of 2,600 eligible sessions is a 2.9% share,
   * and the judge is aimed at a count rather than a share, so that share is the sampler working as
   * designed. The dimension is ready.
   */
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
    expect(row?.value).toContain("37 / 50 evaluated")
    expect(row?.value).not.toContain("%")
  })

  // 13 verdicts short, filling at 37 per 7 days, so roughly three more days of traffic.
  it("projects how long the window still needs, from the rate it has been filling at", () => {
    const row = outcomeRow(
      explanation({
        outcomeEvaluations: { current: 37, required: 50 },
        outcomeUnmeasuredReason: "examinedFloor",
        stepDays: 7,
      }),
    )

    expect(row?.value).toBe("37 / 50 evaluated · about 3 days left")
  })

  it("offers no projection before any evaluation has landed, because there is no rate yet", () => {
    const row = outcomeRow(
      explanation({ outcomeEvaluations: { current: 0, required: 50 }, outcomeUnmeasuredReason: "examinedFloor" }),
    )

    expect(row?.value).toBe("0 / 50 evaluated")
  })

  /**
   * A snapshot stored under an earlier scoring version can still carry the retired share
   * requirement and the
   * `coverageFloor` reason it produced. The page has to name its blocker rather than fall through
   * to a generic message.
   */
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
    // The exact string the reported project showed before this change.
    expect(row?.value).toBe("2.9% / 5.0% coverage")
  })
})
