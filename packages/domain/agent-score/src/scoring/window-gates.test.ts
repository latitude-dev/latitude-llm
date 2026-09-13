import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { WindowSpeedAggregate } from "./bootstrap-window.ts"
import type { FamilyReadingCoverage, WindowFold } from "./fold-window-contributions.ts"
import type { WindowReaderCoverage } from "./tally-reader-coverage.ts"
import { gateCostWindow, gateSpeedWindow } from "./window-gates.ts"

const COST_FLOORS = LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.cost
const SPEED_FLOORS = LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors.speed

const familyCoverage = (
  overrides: Partial<Record<CostFamily, FamilyReadingCoverage>> = {},
): Record<CostFamily, FamilyReadingCoverage> =>
  Object.fromEntries(
    COST_FAMILIES.map((family) => [family, overrides[family] ?? { applicable: 100, readable: 100 }]),
  ) as Record<CostFamily, FamilyReadingCoverage>

const fold = (overrides: Partial<WindowFold> = {}): WindowFold => ({
  contributions: [],
  foldedSessionCount: 1_000,
  withheldSessionCount: 0,
  familyCoverage: familyCoverage(),
  costCauseUnits: new Map(),
  speedCauseNs: new Map(),
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

const latencyReader = (overrides: Partial<WindowReaderCoverage> = {}): WindowReaderCoverage => ({
  readerId: "spans.throughput",
  label: "Generation throughput",
  scoreDimensions: ["speed"],
  applicableSessions: 800,
  fullyReadSessions: 800,
  readableUnits: 800,
  applicableUnits: 800,
  coverage: 1,
  limitations: {},
  ...overrides,
})

const gateSpeed = (overrides: Omit<Parameters<typeof gateSpeedWindow>[0], "latencyReaderCoverage">) =>
  gateSpeedWindow({ latencyReaderCoverage: [latencyReader()], ...overrides })

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
        speed: speedAggregate({ includedSessionCount: 50 }),
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

  it("withholds when a latency reference was missing for an applicable generation", () => {
    expect(
      gateSpeedWindow({
        speed: speedAggregate(),
        eligibleSessionCount: 1_000,
        latencyReaderCoverage: [latencyReader({ applicableUnits: 800, readableUnits: 799, coverage: 799 / 800 })],
        floors: SPEED_FLOORS,
      }),
    ).toMatchObject({ coverage: "unmeasured", unmeasuredReason: "latencyReferenceCoverage" })
  })
})
