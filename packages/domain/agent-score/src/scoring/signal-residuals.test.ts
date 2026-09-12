import { describe, expect, it } from "vitest"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import {
  capResidualEffects,
  DEFAULT_RESIDUAL_SUPPORT,
  estimateResidualEffect,
  type MatchedSession,
} from "./estimate-residual-effect.ts"
import {
  estimateCostSignalResiduals,
  estimateSpeedSignalResiduals,
  type SignalResidualGroup,
} from "./estimate-signal-residuals.ts"
import { linkSignalOccurrences, type SignalOccurrence } from "./link-signal-occurrences.ts"

const familyRecord = <Value>(value: Value): Record<CostFamily, Value> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, value])) as Record<CostFamily, Value>

const curve: CostMetricCurve = {
  curveId: "c",
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: 0,
  watchMaxRawValue: 1,
}

const artifact = (residualSignalCap: number): CostScoringArtifact => ({
  artifactVersion: "residual-test",
  calibration: "provisional",
  familyWeights: { spend: 0.2, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
  metricCurves: PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => ({ ...curve, curveId: entry.curveId })),
  metricCaps: Object.fromEntries(PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => [entry.metricId, 1])),
  familyCaps: familyRecord(1),
  familyCoverageRequirements: familyRecord({ required: false, coverageFloor: 0.5 }),
  overlapPolicies: [],
  residualSignalCap,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.1 },
})

const session = (index: number, overrides: Partial<MatchedSession> = {}): MatchedSession => ({
  sessionId: `session-${index}`,
  stratum: "openai/gpt-4o",
  outcome: 0,
  inclusionProbabilityByGroupId: new Map([["group-a", 1]]),
  exposedGroupIds: [],
  fold: (index % 2) as 0 | 1,
  ...overrides,
})

/** `exposedCount` exposed sessions at `exposedOutcome`, the rest clean at `cleanOutcome`. */
const cohort = ({
  exposedCount,
  cleanCount,
  exposedOutcome,
  cleanOutcome,
  groupIds = ["group-a"],
  stratum,
}: {
  readonly exposedCount: number
  readonly cleanCount: number
  readonly exposedOutcome: number
  readonly cleanOutcome: number
  readonly groupIds?: readonly string[]
  readonly stratum?: string
}): MatchedSession[] => [
  ...Array.from({ length: exposedCount }, (_, index) =>
    session(index, {
      outcome: exposedOutcome,
      exposedGroupIds: groupIds,
      ...(stratum ? { stratum } : {}),
    }),
  ),
  ...Array.from({ length: cleanCount }, (_, index) =>
    session(index + exposedCount, { outcome: cleanOutcome, ...(stratum ? { stratum } : {}) }),
  ),
]

describe("linkSignalOccurrences", () => {
  const owned = new Map<CostFamily, ReadonlySet<string>>([
    ["tools", new Set(["toolCall:t:1", "toolCall:t:2"])],
    ["context", new Set(["toolResult:abc"])],
  ])
  const occurrence = (overrides: Partial<SignalOccurrence> = {}): SignalOccurrence => ({
    signalId: "signal-1",
    sessionId: "session-1",
    atomIds: [],
    ...overrides,
  })

  it("links an occurrence that lands on an atom a family already charges", () => {
    const linkage = linkSignalOccurrences({
      occurrences: [occurrence({ atomIds: ["toolCall:t:1"] })],
      ownedAtomsByFamily: owned,
    })

    expect(linkage.linked).toHaveLength(1)
    expect(linkage.linked[0]).toMatchObject({ families: ["tools"], matchedAtomIds: ["toolCall:t:1"] })
    expect(linkage.unlinked).toEqual([])
  })

  it("links through a finding key when the occurrence carries no atoms of its own", () => {
    const linkage = linkSignalOccurrences({
      occurrences: [occurrence({ findingKey: "finding-1" })],
      ownedAtomsByFamily: owned,
      atomIdsByFindingKey: new Map([["finding-1", ["toolCall:t:2"]]]),
    })

    expect(linkage.linked[0]?.families).toEqual(["tools"])
  })

  it("reports every family an occurrence touches", () => {
    const linkage = linkSignalOccurrences({
      occurrences: [occurrence({ atomIds: ["toolCall:t:1", "toolResult:abc"] })],
      ownedAtomsByFamily: owned,
    })

    expect(linkage.linked[0]?.families).toEqual(["tools", "context"])
  })

  it("leaves an occurrence unlinked when nothing already charges its atoms", () => {
    const linkage = linkSignalOccurrences({
      occurrences: [occurrence({ atomIds: ["toolCall:unknown"] }), occurrence({ signalId: "signal-2" })],
      ownedAtomsByFamily: owned,
    })

    expect(linkage.linked).toEqual([])
    expect(linkage.unlinked.map((entry) => entry.signalId)).toEqual(["signal-1", "signal-2"])
  })
})

describe("estimateResidualEffect", () => {
  it("measures the matched difference and shrinks it toward zero", () => {
    const sessions = cohort({ exposedCount: 20, cleanCount: 20, exposedOutcome: 0.5, cleanOutcome: 0.1 })
    const result = estimateResidualEffect({ sessions, groupId: "group-a" })

    expect(result.measured).toBe(true)
    if (result.measured) {
      expect(result.rawEffect).toBeCloseTo(0.4, 6)
      expect(result.effect).toBeCloseTo(0.4 * (20 / 40), 6)
      expect(result.effect).toBeLessThan(result.rawEffect)
    }
  })

  it("shrinks a small comparison harder than a large one", () => {
    const small = estimateResidualEffect({
      sessions: cohort({ exposedCount: 6, cleanCount: 20, exposedOutcome: 0.5, cleanOutcome: 0.1 }),
      groupId: "group-a",
    })
    const large = estimateResidualEffect({
      sessions: cohort({ exposedCount: 200, cleanCount: 200, exposedOutcome: 0.5, cleanOutcome: 0.1 }),
      groupId: "group-a",
    })

    expect(small.measured && large.measured && small.effect).toBeLessThan((large.measured && large.effect) || 0)
  })

  it("never returns a credit when the signal-bearing sessions look better", () => {
    const result = estimateResidualEffect({
      sessions: cohort({ exposedCount: 20, cleanCount: 20, exposedOutcome: 0.05, cleanOutcome: 0.4 }),
      groupId: "group-a",
    })

    expect(result.measured && result.effect).toBe(0)
    expect(result.measured && result.rawEffect).toBeLessThan(0)
  })

  it("weights a sampled session by the inverse of its inclusion probability", () => {
    const sessions: MatchedSession[] = [
      ...Array.from({ length: 10 }, (_, index) =>
        session(index, {
          outcome: 1,
          exposedGroupIds: ["group-a"],
          inclusionProbabilityByGroupId: new Map([["group-a", 0.1]]),
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) => session(index + 10, { outcome: 0 })),
    ]
    const result = estimateResidualEffect({ sessions, groupId: "group-a" })

    expect(result.measured && result.rawEffect).toBeCloseTo(1, 6)
  })

  it("does not apply one group's sampling probability to another group", () => {
    const sessions: MatchedSession[] = [
      ...Array.from({ length: 10 }, (_, index) =>
        session(index, {
          outcome: index < 5 ? 1 : 0,
          exposedGroupIds: ["group-a", "group-b"],
          inclusionProbabilityByGroupId: new Map([
            ["group-a", 1],
            ["group-b", 0.01],
          ]),
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) => session(index + 10, { outcome: 0 })),
    ]

    const result = estimateResidualEffect({ sessions, groupId: "group-a" })

    expect(result.measured && result.rawEffect).toBeCloseTo(0.5, 6)
  })

  it("leaves an effect unmeasured when its reader probability is unavailable", () => {
    const sessions = cohort({ exposedCount: 10, cleanCount: 10, exposedOutcome: 1, cleanOutcome: 0 }).map((entry) => ({
      ...entry,
      inclusionProbabilityByGroupId: new Map(),
    }))

    expect(estimateResidualEffect({ sessions, groupId: "group-a" })).toEqual({
      measured: false,
      reason: "unknownInclusionProbability",
    })
  })

  it("only compares inside a stratum, so a confounded size difference is not an effect", () => {
    const sessions = [
      ...cohort({ exposedCount: 10, cleanCount: 10, exposedOutcome: 0.5, cleanOutcome: 0.5, stratum: "big" }),
      ...cohort({ exposedCount: 10, cleanCount: 10, exposedOutcome: 0.1, cleanOutcome: 0.1, stratum: "small" }),
    ]
    const result = estimateResidualEffect({ sessions, groupId: "group-a" })

    expect(result.measured && result.rawEffect).toBeCloseTo(0, 6)
  })

  it("evaluates out of fold so promotion traffic cannot fit its own effect", () => {
    const sessions = [
      ...Array.from({ length: 12 }, (_, index) =>
        session(index, { outcome: 0.9, exposedGroupIds: ["group-a"], fold: 0 }),
      ),
      ...Array.from({ length: 12 }, (_, index) => session(index + 12, { outcome: 0.1, fold: 0 })),
      ...Array.from({ length: 12 }, (_, index) =>
        session(index + 24, { outcome: 0.2, exposedGroupIds: ["group-a"], fold: 1 }),
      ),
      ...Array.from({ length: 12 }, (_, index) => session(index + 36, { outcome: 0.1, fold: 1 })),
    ]
    const result = estimateResidualEffect({ sessions, groupId: "group-a" })

    expect(result.measured && result.rawEffect).toBeCloseTo((0.8 + 0.1) / 2, 6)
    expect(result.measured && result.usedStrata).toBe(2)
  })

  it("returns not measured without exposure, without overlap, or without support", () => {
    expect(
      estimateResidualEffect({
        sessions: cohort({ exposedCount: 0, cleanCount: 20, exposedOutcome: 0, cleanOutcome: 0 }),
        groupId: "group-a",
      }),
    ).toEqual({ measured: false, reason: "noExposure" })
    expect(
      estimateResidualEffect({
        sessions: cohort({ exposedCount: 2, cleanCount: 20, exposedOutcome: 0.5, cleanOutcome: 0.1 }),
        groupId: "group-a",
      }),
    ).toEqual({ measured: false, reason: "insufficientSupport" })
    expect(
      estimateResidualEffect({
        sessions: [
          ...Array.from({ length: 10 }, (_, index) =>
            session(index, { outcome: 0.5, exposedGroupIds: ["group-a"], stratum: "only-exposed" }),
          ),
          ...Array.from({ length: 10 }, (_, index) => session(index + 10, { outcome: 0.1, stratum: "only-clean" })),
        ],
        groupId: "group-a",
      }),
    ).toEqual({ measured: false, reason: "noOverlap" })
  })

  it("respects raised support floors", () => {
    expect(
      estimateResidualEffect({
        sessions: cohort({ exposedCount: 10, cleanCount: 10, exposedOutcome: 0.5, cleanOutcome: 0.1 }),
        groupId: "group-a",
        floors: { ...DEFAULT_RESIDUAL_SUPPORT, minimumExposedSessions: 50 },
      }).measured,
    ).toBe(false)
  })
})

describe("capResidualEffects", () => {
  it("leaves effects alone inside the cap and scales them proportionally past it", () => {
    expect([
      ...capResidualEffects({
        effects: new Map([
          ["a", 0.02],
          ["b", 0.03],
        ]),
        cap: 0.1,
      }).values(),
    ]).toEqual([0.02, 0.03])
    const scaled = [
      ...capResidualEffects({
        effects: new Map([
          ["a", 0.2],
          ["b", 0.6],
        ]),
        cap: 0.4,
      }).values(),
    ]
    expect(scaled[0]).toBeCloseTo(0.1, 9)
    expect(scaled[1]).toBeCloseTo(0.3, 9)
    expect(scaled.reduce((total, value) => total + value, 0)).toBeCloseTo(0.4, 9)
  })

  it("stops twenty weak signals adding up to more than one could claim", () => {
    const many = new Map(Array.from({ length: 20 }, (_, index) => [`s${index}`, 0.05]))
    const capped = capResidualEffects({ effects: many, cap: 0.1 })

    expect([...capped.values()].reduce((total, value) => total + value, 0)).toBeCloseTo(0.1, 9)
  })
})

describe("estimateCostSignalResiduals", () => {
  const group: SignalResidualGroup = {
    groupId: "group-a",
    signalIds: ["signal-1", "signal-2"],
    occurrencesBySignal: new Map([
      ["signal-1", 30],
      ["signal-2", 10],
    ]),
  }

  it("fits per family and splits the group effect by occurrence share", () => {
    const sessions = cohort({ exposedCount: 20, cleanCount: 20, exposedOutcome: 0.5, cleanOutcome: 0.1 })
    const { residuals } = estimateCostSignalResiduals({
      sessionsByFamily: new Map([["tools", sessions]]),
      groups: [group],
      artifact: artifact(1),
    })

    const bySignal = new Map(residuals.map((residual) => [residual.signalId, residual]))
    expect(bySignal.get("signal-1")?.family).toBe("tools")
    expect((bySignal.get("signal-1")?.penaltyShare ?? 0) / (bySignal.get("signal-2")?.penaltyShare ?? 1)).toBeCloseTo(
      3,
      6,
    )
  })

  it("keeps the total inside the artifact's residual cap", () => {
    const sessions = cohort({ exposedCount: 40, cleanCount: 40, exposedOutcome: 1, cleanOutcome: 0 })
    const { residuals } = estimateCostSignalResiduals({
      sessionsByFamily: new Map([
        ["tools", sessions],
        ["memory", sessions],
      ]),
      groups: [group],
      artifact: artifact(0.05),
    })

    expect(residuals.reduce((total, residual) => total + residual.penaltyShare, 0)).toBeCloseTo(0.05, 9)
  })

  it("reports a gap rather than a zero when no family comparison held", () => {
    const { residuals, gaps } = estimateCostSignalResiduals({
      sessionsByFamily: new Map([
        ["tools", cohort({ exposedCount: 1, cleanCount: 2, exposedOutcome: 0.5, cleanOutcome: 0 })],
      ]),
      groups: [group],
      artifact: artifact(0.1),
    })

    expect(residuals).toEqual([])
    expect(gaps.map((gap) => gap.signalId)).toEqual(["signal-1", "signal-2"])
    expect(gaps[0]?.support.reason).toBe("insufficientSupport")
  })
})

describe("estimateSpeedSignalResiduals", () => {
  const group: SignalResidualGroup = {
    groupId: "group-a",
    signalIds: ["signal-1"],
    occurrencesBySignal: new Map([["signal-1", 5]]),
  }

  it("estimates in nanoseconds and shares no cap with Cost", () => {
    const sessions = cohort({
      exposedCount: 20,
      cleanCount: 20,
      exposedOutcome: 900_000_000,
      cleanOutcome: 100_000_000,
    })
    const { residuals } = estimateSpeedSignalResiduals({ sessions, groups: [group] })

    expect(residuals[0]?.avoidableNs).toBeCloseTo(800_000_000 * (20 / 40), 3)
  })

  it("reports a gap when the comparison fails", () => {
    const { residuals, gaps } = estimateSpeedSignalResiduals({
      sessions: cohort({ exposedCount: 0, cleanCount: 20, exposedOutcome: 0, cleanOutcome: 0 }),
      groups: [group],
    })

    expect(residuals).toEqual([])
    expect(gaps[0]?.support.reason).toBe("noExposure")
  })
})
