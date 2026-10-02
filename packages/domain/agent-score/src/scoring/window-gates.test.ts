import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { WindowSpeedAggregate } from "./bootstrap-window.ts"
import { EMPTY_WINDOW_FOLD, type FamilyReadingCoverage, type WindowFold } from "./fold-window-contributions.ts"
import { gateCostWindow, gateSpeedWindow, UNREFERENCED_LATENCY_MODEL_LIMIT } from "./window-gates.ts"

const COST_FLOORS = LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.cost
const SPEED_FLOORS = LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.speed

const familyCoverage = (
  overrides: Partial<Record<CostFamily, FamilyReadingCoverage>> = {},
): Record<CostFamily, FamilyReadingCoverage> =>
  Object.fromEntries(
    COST_FAMILIES.map((family) => [family, overrides[family] ?? { applicable: 100, readable: 100 }]),
  ) as Record<CostFamily, FamilyReadingCoverage>

const fold = (overrides: Partial<WindowFold> = {}): WindowFold => ({
  ...EMPTY_WINDOW_FOLD,
  foldedSessionCount: 1_000,
  familyCoverage: familyCoverage(),
  ...overrides,
})

const gateCost = (overrides: Partial<WindowFold> = {}, artifact: CostScoringArtifact = LAUNCH_COST_SCORING_ARTIFACT) =>
  gateCostWindow({ fold: fold(overrides), artifact, floors: COST_FLOORS })

describe("gateCostWindow", () => {
  it("publishes when every required family was readable", () => {
    expect(gateCost()).toMatchObject({ coverage: "measured" })
  })

  it("withholds when a required family applies and could not be read", () => {
    const result = gateCost({ familyCoverage: familyCoverage({ spend: { applicable: 100, readable: 10 } }) })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "requiredFamilyUnreadable" })
    expect(result.families.find((family) => family.family === "spend")).toMatchObject({
      required: true,
      coverage: 0.1,
      meetsCoverageFloor: false,
    })
  })

  it("treats a required family that applies to nothing as covered, not as missing", () => {
    const result = gateCost({ familyCoverage: familyCoverage({ spend: { applicable: 0, readable: 0 } }) })

    expect(result.coverage).toBe("measured")
    expect(result.families.find((family) => family.family === "spend")?.coverage).toBe(1)
  })

  it("ignores an unreadable optional family, which lowers coverage without withholding", () => {
    const result = gateCost({ familyCoverage: familyCoverage({ memory: { applicable: 100, readable: 5 } }) })

    expect(result.coverage).toBe("measured")
    expect(result.families.find((family) => family.family === "memory")).toMatchObject({
      required: false,
      meetsCoverageFloor: false,
    })
  })

  it("withholds when too few sessions survived the session-level check", () => {
    // Dropping these sessions and scoring the rest would shrink the denominator until the readable
    // sessions looked like the whole project.
    const result = gateCost({ foldedSessionCount: 300, withheldSessionCount: 700 })

    expect(result).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "publishableSessionFloor" })
    expect(result.publishableSessionShare).toBeCloseTo(0.3, 12)
  })

  it("withholds when no session was publishable at all", () => {
    expect(gateCost({ foldedSessionCount: 0, withheldSessionCount: 40 })).toMatchObject({
      coverage: "unmeasured",
      unmeasuredReason: "noReadableSessions",
    })
  })

  it("reports the withheld count as evidence rather than swallowing it", () => {
    expect(gateCost({ foldedSessionCount: 900, withheldSessionCount: 100 })).toMatchObject({
      coverage: "measured",
      publishableSessionCount: 900,
      withheldSessionCount: 100,
    })
  })
})

const speedAggregate = (overrides: Partial<WindowSpeedAggregate> = {}): WindowSpeedAggregate => ({
  observedNs: 1_000_000_000,
  avoidableNs: 100_000_000,
  speed: 90,
  includedSessionCount: 800,
  excludedSessionCount: 200,
  ...overrides,
})

type SpeedGateInput = Parameters<typeof gateSpeedWindow>[0]

const gateSpeed = (
  overrides: Omit<SpeedGateInput, "missingLatencyReferenceSessionCount" | "unreferencedLatencyModels"> &
    Partial<Pick<SpeedGateInput, "missingLatencyReferenceSessionCount" | "unreferencedLatencyModels">>,
) => gateSpeedWindow({ missingLatencyReferenceSessionCount: 0, unreferencedLatencyModels: [], ...overrides })

describe("gateSpeedWindow", () => {
  it("publishes when enough critical paths reconstructed", () => {
    expect(gateSpeed({ speed: speedAggregate(), eligibleSessionCount: 1_000, floors: SPEED_FLOORS })).toMatchObject({
      coverage: "measured",
      completeSessionCount: 800,
    })
  })

  it("withholds below the complete-path session floor", () => {
    expect(
      gateSpeed({
        speed: speedAggregate({ includedSessionCount: 49 }),
        eligibleSessionCount: 1_000,
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "completePathFloor" })
  })

  it("withholds when the reconstructed sessions describe too little of the base", () => {
    expect(
      gateSpeed({
        speed: speedAggregate({ includedSessionCount: 300, excludedSessionCount: 9_700 }),
        eligibleSessionCount: 10_000,
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "completePathCoverageFloor" })
  })

  it("withholds when there is no observed time to divide by", () => {
    expect(
      gateSpeed({
        speed: speedAggregate({ observedNs: 0, avoidableNs: 0 }),
        eligibleSessionCount: 1_000,
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "noObservedTime" })
  })

  it("publishes over the judged sessions when a few ran through an unreferenced model", () => {
    const gpt5Mini = { provider: "openai", model: "gpt-5-mini", sessionCount: 10 }
    expect(
      gateSpeed({
        speed: speedAggregate({ includedSessionCount: 790, excludedSessionCount: 210 }),
        eligibleSessionCount: 1_000,
        missingLatencyReferenceSessionCount: 10,
        unreferencedLatencyModels: [gpt5Mini],
        floors: SPEED_FLOORS,
      }),
    ).toEqual({
      coverage: "measured",
      completeSessionCount: 790,
      incompleteSessionCount: 210,
      completeShareOfEligible: 0.79,
      missingLatencyReferenceSessionCount: 10,
      unreferencedLatencyModels: [gpt5Mini],
    })
  })

  it("blames the missing references when they are what took Speed below a floor", () => {
    expect(
      gateSpeed({
        speed: speedAggregate({ includedSessionCount: 300, excludedSessionCount: 700 }),
        eligibleSessionCount: 1_000,
        missingLatencyReferenceSessionCount: 600,
        unreferencedLatencyModels: [{ provider: "anthropic", model: "claude-fable-5", sessionCount: 600 }],
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "latencyReferenceCoverage" })
  })

  it("keeps the structural reason when references alone would not clear the floor", () => {
    expect(
      gateSpeed({
        speed: speedAggregate({ includedSessionCount: 300, excludedSessionCount: 700 }),
        eligibleSessionCount: 1_000,
        missingLatencyReferenceSessionCount: 100,
        unreferencedLatencyModels: [{ provider: "anthropic", model: "claude-fable-5", sessionCount: 100 }],
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "completePathCoverageFloor" })
  })

  it("names the models with the most excluded sessions first, up to the limit", () => {
    const models = Array.from({ length: UNREFERENCED_LATENCY_MODEL_LIMIT + 2 }, (_, index) => ({
      provider: "openai",
      model: `model-${String(index).padStart(2, "0")}`,
      sessionCount: index + 1,
    }))
    const gate = gateSpeed({
      speed: speedAggregate(),
      eligibleSessionCount: 1_000,
      missingLatencyReferenceSessionCount: 100,
      unreferencedLatencyModels: models,
      floors: SPEED_FLOORS,
    })

    expect(gate.unreferencedLatencyModels).toHaveLength(UNREFERENCED_LATENCY_MODEL_LIMIT)
    expect(gate.unreferencedLatencyModels[0]).toEqual(models.at(-1))
  })
})
