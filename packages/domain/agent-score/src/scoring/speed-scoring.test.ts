import { buildSessionCriticalPath, type CriticalPathSpanInput } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import {
  aggregateWindowCost,
  aggregateWindowSpeed,
  bootstrapWindow,
  type SessionWindowContribution,
} from "./bootstrap-window.ts"
import { composeSpeedCounterfactual, type SpeedAvoidableClaim } from "./compose-speed-counterfactual.ts"

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z")
const at = (ms: number) => new Date(BASE_MS + ms)
const ns = (ms: number) => ms * 1_000_000

const span = (
  spanId: string,
  fromMs: number,
  toMs: number,
  overrides: Partial<CriticalPathSpanInput> = {},
): CriticalPathSpanInput => ({
  traceId: "trace-1",
  spanId,
  parentSpanId: "root",
  operation: "chat",
  startTime: at(fromMs),
  endTime: at(toMs),
  ...overrides,
})

const root = (overrides: Partial<CriticalPathSpanInput> = {}): CriticalPathSpanInput =>
  span("root", 0, 1_000, { parentSpanId: "", operation: "invoke_agent", ...overrides })

const pathOf = (spans: readonly CriticalPathSpanInput[]) => buildSessionCriticalPath({ spans })

const claim = (
  spanId: string,
  removedMs: number,
  overrides: Partial<SpeedAvoidableClaim> = {},
): SpeedAvoidableClaim => ({
  traceId: "trace-1",
  spanId,
  cause: "test",
  removedNs: ns(removedMs),
  evidence: "confirmed",
  ...overrides,
})

const familyRecord = <Value>(value: Value): Record<CostFamily, Value> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, value])) as Record<CostFamily, Value>

const curve: CostMetricCurve = {
  curveId: "test.curve",
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: 0,
  watchMaxRawValue: 1,
}

const artifact: CostScoringArtifact = {
  artifactVersion: "window-test",
  calibration: "provisional",
  familyWeights: { spend: 1, context: 0, tools: 0, memory: 0, recovery: 0 },
  metricCurves: PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => ({ ...curve, curveId: entry.curveId })),
  metricCaps: Object.fromEntries(PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => [entry.metricId, 1])),
  familyCaps: familyRecord(1),
  familyCoverageRequirements: familyRecord({ required: false, coverageFloor: 0.5 }),
  overlapPolicies: [],
  residualSignalCap: 0.1,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.1 },
}

const contribution = (
  sessionId: string,
  spend: { readonly eligibleUnits: number; readonly penalizedUnits: number },
  speed: { readonly observedNs: number; readonly avoidableNs: number; readonly usableForDenominator?: boolean },
): SessionWindowContribution => ({
  sessionId,
  costUsableForDenominator: true,
  families: COST_FAMILIES.map((family) =>
    family === "spend" ? { family, ...spend } : { family, eligibleUnits: 0, penalizedUnits: 0 },
  ),
  speed: { usableForDenominator: true, ...speed },
})

describe("composeSpeedCounterfactual", () => {
  it("caps a claim by the marginal time its subtree held on the path", () => {
    const criticalPath = pathOf([root(), span("slow", 100, 500)])
    const result = composeSpeedCounterfactual({ criticalPath, claims: [claim("slow", 9_999)] })

    expect(result.observedNs).toBe(ns(1_000))
    expect(result.avoidableNs).toBe(ns(400))
  })

  it("never exceeds the observed critical path however much is claimed", () => {
    const criticalPath = pathOf([root(), span("a", 0, 400), span("b", 400, 1_000)])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [claim("a", 400), claim("b", 600), claim("root", 1_000)],
    })

    expect(result.avoidableNs).toBeLessThanOrEqual(result.observedNs)
  })

  it("drops a claim on a span covered by another claimed ancestor", () => {
    const criticalPath = pathOf([root(), span("tool", 100, 900), span("chat", 300, 700, { parentSpanId: "tool" })])
    const result = composeSpeedCounterfactual({ criticalPath, claims: [claim("tool", 800), claim("chat", 400)] })

    expect(result.avoidableNs).toBe(ns(800))
    expect(result.droppedClaims.map((entry) => entry.reason)).toEqual(["coveredByAncestor"])
  })

  it("lets exact evidence supersede a modeled claim on the same span", () => {
    const criticalPath = pathOf([root(), span("slow", 100, 500)])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [
        claim("slow", 100, { evidence: "confirmed", cause: "ttft" }),
        claim("slow", 400, { evidence: "modeled", cause: "signal" }),
      ],
    })

    expect(result.avoidableNs).toBe(ns(100))
    expect(result.measuredAvoidableNs).toBe(ns(100))
    expect(result.droppedClaims.map((entry) => entry.reason)).toEqual(["supersededByExact"])
  })

  it("counts concurrent siblings as saving nothing on their own", () => {
    const criticalPath = pathOf([root(), span("a", 100, 900), span("b", 200, 900)])
    const result = composeSpeedCounterfactual({ criticalPath, claims: [claim("a", 800)] })

    expect(result.avoidableNs).toBe(ns(100))
  })

  it("separates exact from modeled avoidable time", () => {
    const criticalPath = pathOf([root(), span("a", 0, 300), span("b", 300, 800)])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [claim("a", 300), claim("b", 500, { evidence: "modeled" })],
    })

    expect(result.measuredAvoidableNs).toBe(ns(300))
    expect(result.estimatedAvoidableNs).toBe(ns(500))
  })

  it("reruns the whole composition for each bound rather than summing item bounds", () => {
    const criticalPath = pathOf([root(), span("slow", 100, 500)])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [claim("slow", 300, { evidence: "modeled", bounds: { lowerNs: ns(100), upperNs: ns(9_999) } })],
    })

    expect(result.nativeImpact).toMatchObject({
      unit: "nanoseconds",
      point: ns(300),
      lower: ns(100),
      upper: ns(400),
      interpretation: "identificationBound",
    })
  })

  it("refuses the denominator when the trace never reconstructed", () => {
    const criticalPath = pathOf([span("loose-a", 0, 100), span("loose-b", 200, 300, { parentSpanId: "" })])
    const result = composeSpeedCounterfactual({ criticalPath, claims: [claim("loose-a", 100)] })

    expect(result.observedNs).toBe(0)
    expect(result.avoidableNs).toBe(0)
    expect(result.usableForDenominator).toBe(false)
    expect(result.droppedClaims[0]?.reason).toBe("offCriticalPath")
  })

  it("drops a claim naming a trace the session does not have", () => {
    const criticalPath = pathOf([root(), span("slow", 100, 500)])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [claim("elsewhere", 100, { traceId: "trace-unknown" })],
    })

    expect(result.avoidableNs).toBe(0)
    expect(result.droppedClaims.map((entry) => entry.reason)).toEqual(["noPath"])
  })

  it("drops a claim on a subagent trace, which the interaction that awaited it already counts", () => {
    const criticalPath = pathOf([
      root(),
      span("sub-root", 100, 400, { traceId: "trace-sub", parentSpanId: "outside", operation: "invoke_agent" }),
    ])
    const result = composeSpeedCounterfactual({
      criticalPath,
      claims: [claim("sub-root", 300, { traceId: "trace-sub" })],
    })

    expect(result.droppedClaims.map((entry) => entry.reason)).toEqual(["noPath"])
  })

  it("marks a claim that held no path time as off the critical path", () => {
    const criticalPath = pathOf([root(), span("after", 1_500, 1_800)])
    const result = composeSpeedCounterfactual({ criticalPath, claims: [claim("after", 300)] })

    expect(result.avoidableNs).toBe(0)
    expect(result.droppedClaims.map((entry) => entry.reason)).toEqual(["offCriticalPath"])
  })

  it("excludes a subagent trace from the denominator but stays usable", () => {
    const criticalPath = pathOf([
      root(),
      span("sub-root", 100, 400, { traceId: "trace-sub", parentSpanId: "root", operation: "invoke_agent" }),
    ])

    expect(composeSpeedCounterfactual({ criticalPath, claims: [] }).usableForDenominator).toBe(true)
  })
})

describe("aggregateWindowCost", () => {
  it("pools family units across sessions instead of averaging their penalties", () => {
    const pooled = aggregateWindowCost({
      contributions: [
        contribution("small", { eligibleUnits: 10, penalizedUnits: 10 }, { observedNs: 0, avoidableNs: 0 }),
        contribution("large", { eligibleUnits: 990, penalizedUnits: 0 }, { observedNs: 0, avoidableNs: 0 }),
      ],
      artifact,
    })

    expect(pooled.familyPenalties.spend).toBeCloseTo(0.01, 9)
    expect(pooled.cost).toBeCloseTo(99, 9)
  })

  it("keeps a family with no eligible units out of the penalty", () => {
    const empty = aggregateWindowCost({
      contributions: [contribution("s", { eligibleUnits: 0, penalizedUnits: 0 }, { observedNs: 0, avoidableNs: 0 })],
      artifact,
    })

    expect(empty.costPenalty).toBe(0)
    expect(empty.cost).toBe(100)
  })

  it("applies the family cap and the residual signal penalty", () => {
    const capped = aggregateWindowCost({
      contributions: [contribution("s", { eligibleUnits: 10, penalizedUnits: 10 }, { observedNs: 0, avoidableNs: 0 })],
      artifact: { ...artifact, familyCaps: { ...familyRecord(1), spend: 0.5 } },
      residualSignalPenalty: 0.1,
    })

    expect(capped.costPenalty).toBeCloseTo(0.6, 9)
  })
})

describe("aggregateWindowSpeed", () => {
  it("divides avoidable by observed critical-path time across included sessions", () => {
    const window = aggregateWindowSpeed([
      contribution("a", { eligibleUnits: 0, penalizedUnits: 0 }, { observedNs: ns(1_000), avoidableNs: ns(100) }),
      contribution("b", { eligibleUnits: 0, penalizedUnits: 0 }, { observedNs: ns(1_000), avoidableNs: ns(300) }),
    ])

    expect(window).toMatchObject({ observedNs: ns(2_000), avoidableNs: ns(400), includedSessionCount: 2 })
    expect(window.speed).toBeCloseTo(80, 9)
  })

  it("excludes an unreconstructable session from both sides of the ratio", () => {
    const window = aggregateWindowSpeed([
      contribution("a", { eligibleUnits: 0, penalizedUnits: 0 }, { observedNs: ns(1_000), avoidableNs: ns(100) }),
      contribution(
        "b",
        { eligibleUnits: 0, penalizedUnits: 0 },
        {
          observedNs: ns(9_000),
          avoidableNs: ns(9_000),
          usableForDenominator: false,
        },
      ),
    ])

    expect(window).toMatchObject({ observedNs: ns(1_000), excludedSessionCount: 1 })
    expect(window.speed).toBeCloseTo(90, 9)
  })

  it("reports a full score for a window with no reconstructable session rather than a zero", () => {
    expect(aggregateWindowSpeed([])).toMatchObject({ observedNs: 0, avoidableNs: 0, speed: 100 })
  })
})

describe("bootstrapWindow", () => {
  const contributions = Array.from({ length: 40 }, (_, index) =>
    contribution(
      `session-${index}`,
      { eligibleUnits: 100, penalizedUnits: index % 4 === 0 ? 40 : 4 },
      { observedNs: ns(1_000), avoidableNs: index % 4 === 0 ? ns(400) : ns(40) },
    ),
  )

  it("brackets the point estimate", () => {
    const result = bootstrapWindow({ contributions, artifact, replicates: 120, seed: 7 })

    expect(result.cost.lower).toBeLessThanOrEqual(result.cost.point)
    expect(result.cost.upper).toBeGreaterThanOrEqual(result.cost.point)
    expect(result.speed.lower).toBeLessThanOrEqual(result.speed.point)
    expect(result.speed.upper).toBeGreaterThanOrEqual(result.speed.point)
  })

  it("reproduces the same interval from the same inputs and seed", () => {
    const first = bootstrapWindow({ contributions, artifact, replicates: 80, seed: 3 })
    const second = bootstrapWindow({ contributions, artifact, replicates: 80, seed: 3 })

    expect(first).toEqual(second)
  })

  it("moves the interval when the seed changes but keeps the point estimate fixed", () => {
    const first = bootstrapWindow({ contributions, artifact, replicates: 80, seed: 3 })
    const second = bootstrapWindow({ contributions, artifact, replicates: 80, seed: 99 })

    expect(second.cost.point).toBe(first.cost.point)
    expect(second.speed.point).toBe(first.speed.point)
  })

  it("never produces an interval by summing item bounds", () => {
    const result = bootstrapWindow({ contributions, artifact, replicates: 120, seed: 5 })
    const naiveWidth = contributions.length * 100

    expect(result.cost.upper - result.cost.lower).toBeLessThan(naiveWidth)
    expect(result.cost.upper).toBeLessThanOrEqual(100)
    expect(result.cost.lower).toBeGreaterThanOrEqual(0)
  })

  it("returns a degenerate interval for an empty window", () => {
    const result = bootstrapWindow({ contributions: [], artifact })

    expect(result.cost).toMatchObject({ point: 100, lower: 0, upper: 0, replicates: 0 })
  })
})
