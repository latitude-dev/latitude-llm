import { describe, expect, it } from "vitest"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import type { CostFamily } from "../entities/cost-evidence.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { attributeCostWindow, attributeReliabilityWindow, attributeSpeedWindow } from "./attribute-dimensions.ts"
import type { SessionWindowContribution } from "./bootstrap-window.ts"
import { EMPTY_WINDOW_FOLD, type WindowFold } from "./fold-window-contributions.ts"
import { survivalOverReferenceRun } from "./reference-run.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"

const contribution = (
  families: readonly { family: CostFamily; eligibleUnits: number }[],
): SessionWindowContribution => ({
  sessionId: "session",
  costUsableForDenominator: true,
  families: families.map((entry) => ({ ...entry, penalizedUnits: 0 })),
  speed: { observedNs: 0, avoidableNs: 0, usableForDenominator: true },
})

const fold = (overrides: Partial<WindowFold>): WindowFold => ({ ...EMPTY_WINDOW_FOLD, ...overrides })

describe("attributeCostWindow", () => {
  const costFold = fold({
    contributions: [
      contribution([
        { family: "tools", eligibleUnits: 1_000 },
        { family: "context", eligibleUnits: 10_000 },
      ]),
    ],
    foldedSessionCount: 100,
    costCauseUnits: new Map([
      ["tools.repeated_call", { family: "tools" as const, penalizedUnits: 200 }],
      ["cost.cache_gap", { family: "context" as const, penalizedUnits: 3_000 }],
    ]),
  })

  /** The score the cause model itself produces, which is what an untouched attribution explains. */
  const modelScore =
    100 -
    attributeCostWindow({ fold: costFold, artifact: LAUNCH_COST_SCORING_ARTIFACT, observedScore: 100 }).explainedDeficit

  it("ranks causes by their share of the deficit", () => {
    const result = attributeCostWindow({
      fold: costFold,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: modelScore,
    })

    expect(result.rows.map((row) => row.causeId)).toEqual(["cost.cache_gap", "tools.repeated_call"])
  })

  it("reports the native units beside every row, not only points", () => {
    const result = attributeCostWindow({
      fold: costFold,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: 90,
    })

    expect(result.rows.find((row) => row.causeId === "cost.cache_gap")?.nativeEffect).toEqual({
      value: 3_000,
      unit: "context",
    })
  })

  it("closes against the observed score", () => {
    const result = attributeCostWindow({
      fold: costFold,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: modelScore,
    })
    const attributed = result.rows.reduce((total, row) => total + row.attributedDeficit, 0)

    expect(attributed + result.residual).toBeCloseTo(result.totalDeficit, 9)
  })

  it("never lets the rows claim more than the score actually lost", () => {
    // The cause model applies family caps over pooled units, so it can explain a larger deficit than
    // the per-session estimator published. The rows are scaled to fit rather than over-claiming.
    const result = attributeCostWindow({
      fold: costFold,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: 98,
    })
    const attributed = result.rows.reduce((total, row) => total + row.attributedDeficit, 0)

    expect(attributed).toBeLessThanOrEqual(result.totalDeficit + 1e-9)
    expect(result.explainedDeficit).toBeGreaterThan(result.totalDeficit)
  })

  it("leaves the unlinked-signal residual unattributed rather than blaming a metric for it", () => {
    const withResidual = attributeCostWindow({
      fold: costFold,
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: modelScore - 5,
      residualSignalPenalty: 0.05,
    })

    expect(withResidual.residual).toBeGreaterThan(0)
  })

  it("attributes nothing when no cause was recorded", () => {
    const result = attributeCostWindow({
      fold: fold({ foldedSessionCount: 10 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      observedScore: 80,
    })

    expect(result.rows).toEqual([])
    expect(result.residual).toBeCloseTo(20, 9)
  })
})

describe("attributeSpeedWindow", () => {
  const speedFold = fold({
    foldedSessionCount: 50,
    speedCauseNs: new Map([
      ["latency:ttft", 300_000],
      ["tools.repeated_call", 100_000],
    ]),
  })

  it("attributes in nanoseconds before the ratio", () => {
    const result = attributeSpeedWindow({
      fold: speedFold,
      observedNs: 1_000_000,
      observedScore: 60,
    })

    expect(result.rows.find((row) => row.causeId === "latency:ttft")?.nativeEffect).toEqual({
      value: 300_000,
      unit: "nanoseconds",
    })
  })

  it("gives the larger claim the larger share", () => {
    const result = attributeSpeedWindow({ fold: speedFold, observedNs: 1_000_000, observedScore: 60 })
    const ttft = result.rows.find((row) => row.causeId === "latency:ttft")?.attributedDeficit as number
    const repeated = result.rows.find((row) => row.causeId === "tools.repeated_call")?.attributedDeficit as number

    expect(ttft).toBeGreaterThan(repeated)
    expect(ttft + repeated).toBeCloseTo(40, 6)
  })

  it("attributes nothing when no time was observed", () => {
    const result = attributeSpeedWindow({ fold: speedFold, observedNs: 0, observedScore: 100 })

    expect(result.rows.every((row) => row.attributedDeficit === 0)).toBe(true)
  })
})

describe("attributeReliabilityWindow", () => {
  const endpoint = (sessionId: string, causes: readonly string[]): ReliabilitySessionEndpoint => ({
    sessionId,
    terminalFailure: causes.length > 0,
    readable: true,
    causes,
  })

  const endpoints = [
    ...Array.from({ length: 90 }, (_, index) => endpoint(`ok-${index}`, [])),
    ...Array.from({ length: 6 }, (_, index) => endpoint(`provider-${index}`, ["providerError"])),
    ...Array.from({ length: 2 }, (_, index) => endpoint(`tool-${index}`, ["toolFailure"])),
    // Two causes on one session: either one ends it, so neither alone recovers it.
    ...Array.from({ length: 2 }, (_, index) => endpoint(`both-${index}`, ["providerError", "toolFailure"])),
  ]

  const observed = survivalOverReferenceRun({ adverseRate: 10 / 100, referenceRunSessions: 20 })

  it("gives the cause that ended more sessions the larger share", () => {
    const result = attributeReliabilityWindow({ endpoints, referenceRunSessions: 20, observedScore: observed })
    const provider = result.rows.find((row) => row.causeId === "providerError")?.attributedDeficit as number
    const tool = result.rows.find((row) => row.causeId === "toolFailure")?.attributedDeficit as number

    expect(provider).toBeGreaterThan(tool)
  })

  it("counts a session once however many causes ended it", () => {
    const result = attributeReliabilityWindow({ endpoints, referenceRunSessions: 20, observedScore: observed })
    const attributed = result.rows.reduce((total, row) => total + row.attributedDeficit, 0)

    expect(attributed).toBeCloseTo(result.totalDeficit, 6)
  })

  it("reports the sessions each cause ended as its native effect", () => {
    const result = attributeReliabilityWindow({ endpoints, referenceRunSessions: 20, observedScore: observed })

    expect(result.rows.find((row) => row.causeId === "providerError")?.nativeEffect).toEqual({
      value: 8,
      unit: "sessions",
    })
  })

  it("gives a redundant cause a share but no fix gain on the sessions it shares", () => {
    const shared = [
      ...Array.from({ length: 90 }, (_, index) => endpoint(`ok-${index}`, [])),
      ...Array.from({ length: 10 }, (_, index) => endpoint(`both-${index}`, ["providerError", "toolFailure"])),
    ]
    const result = attributeReliabilityWindow({
      endpoints: shared,
      referenceRunSessions: 20,
      observedScore: survivalOverReferenceRun({ adverseRate: 0.1, referenceRunSessions: 20 }),
    })

    expect(result.rows.every((row) => row.attributedDeficit > 0)).toBe(true)
    expect(result.rows.every((row) => row.fixGain === 0)).toBe(true)
  })

  it("attributes nothing when no session failed", () => {
    const clean = Array.from({ length: 50 }, (_, index) => endpoint(`ok-${index}`, []))

    expect(
      attributeReliabilityWindow({ endpoints: clean, referenceRunSessions: 20, observedScore: 100 }),
    ).toMatchObject({ rows: [], residual: 0 })
  })
})

describe("cause destinations", () => {
  it("sends a Cost metric to the section its catalog entry names", () => {
    const result = attributeCostWindow({
      fold: fold({
        contributions: [contribution([{ family: "tools", eligibleUnits: 1_000 }])],
        foldedSessionCount: 100,
        costCauseUnits: new Map([["tools.repeated_call", { family: "tools" as const, penalizedUnits: 300 }]]),
      }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
      observedScore: 90,
    })

    expect(result.rows[0]?.destination).toBe("cost")
  })

  it("sends a repeated tool call on the Speed side to Tools", () => {
    const result = attributeSpeedWindow({
      fold: fold({ foldedSessionCount: 50, speedCauseNs: new Map([["tools.repeated_call", 400_000]]) }),
      observedNs: 1_000_000,
      observedScore: 60,
    })

    expect(result.rows[0]?.destination).toBe("tools")
  })

  it("sends a terminal tool failure to Tools and a provider error to Sessions", () => {
    const endpoint = (sessionId: string, causes: readonly string[]) => ({
      sessionId,
      terminalFailure: causes.length > 0,
      readable: true,
      causes,
    })
    const result = attributeReliabilityWindow({
      endpoints: [
        ...Array.from({ length: 80 }, (_, index) => endpoint(`ok-${index}`, [])),
        ...Array.from({ length: 12 }, (_, index) => endpoint(`tool-${index}`, ["toolFailure"])),
        ...Array.from({ length: 8 }, (_, index) => endpoint(`provider-${index}`, ["providerError"])),
      ],
      referenceRunSessions: 20,
      observedScore: survivalOverReferenceRun({ adverseRate: 0.2, referenceRunSessions: 20 }),
    })

    expect(result.rows.find((row) => row.causeId === "toolFailure")?.destination).toBe("tools")
    expect(result.rows.find((row) => row.causeId === "providerError")?.destination).toBe("sessions")
  })

  it("sends a recovered tool retry to Tools, under the name the reader gives it", () => {
    const result = attributeSpeedWindow({
      fold: fold({ foldedSessionCount: 50, speedCauseNs: new Map([["recovered:toolFailure", 400_000]]) }),
      observedNs: 1_000_000,
      observedScore: 60,
    })

    expect(result.rows[0]?.destination).toBe("tools")
  })

  it("leaves a cause nothing maps as unlinked rather than guessing a section", () => {
    const result = attributeSpeedWindow({
      fold: fold({ foldedSessionCount: 50, speedCauseNs: new Map([["something:unmapped", 400_000]]) }),
      observedNs: 1_000_000,
      observedScore: 60,
    })

    expect(result.rows[0]?.destination).toBeUndefined()
  })
})
