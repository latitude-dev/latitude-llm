import type { EntrySignalsSnapshot } from "@domain/alerts"
import type { IssueEscalationSignals } from "@domain/scores"
import { IssueId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  ESCALATION_EXIT_DWELL_MS,
  ESCALATION_MAX_DURATION_MS,
} from "./constants.ts"
import { type Issue, type IssueCentroid, IssueState } from "./entities/issue.ts"
import {
  createIssueCentroid,
  deriveIssueLifecycleStates,
  evaluateSeasonalEscalation,
  getEscalationOccurrenceThreshold,
  normalizeEmbedding,
  normalizeIssueCentroid,
  updateIssueCentroid,
} from "./helpers.ts"

const halfLifeMilliseconds = CENTROID_HALF_LIFE_SECONDS * 1000

const makeVector = (entries: ReadonlyArray<readonly [number, number]>): number[] => {
  const vector = new Array<number>(CENTROID_EMBEDDING_DIMENSIONS).fill(0)

  for (const [index, value] of entries) {
    vector[index] = value
  }

  return vector
}

const makeCentroid = (overrides: Partial<IssueCentroid> = {}): IssueCentroid => {
  const centroid = createIssueCentroid()

  return {
    ...centroid,
    ...overrides,
    base: overrides.base ? [...overrides.base] : centroid.base,
    weights: overrides.weights ? { ...overrides.weights } : centroid.weights,
  }
}

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  uuid: "11111111-1111-4111-8111-111111111111",
  slug: "test-issue",
  organizationId: "oooooooooooooooooooooooo",
  projectId: "pppppppppppppppppppppppp",
  name: "Secret leakage",
  description: "The assistant reveals internal credentials.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

describe("issue centroid helpers", () => {
  it("creates empty centroids with the pinned v2 config", () => {
    const centroid = createIssueCentroid()

    expect(centroid.base).toHaveLength(CENTROID_EMBEDDING_DIMENSIONS)
    expect(centroid.base.every((value) => value === 0)).toBe(true)
    expect(centroid.mass).toBe(0)
    expect(centroid.decay).toBe(CENTROID_HALF_LIFE_SECONDS)
    expect(centroid.weights).toEqual(CENTROID_SOURCE_WEIGHTS)
  })

  it("adds source-weighted contributions and clamps future score timestamps", () => {
    const timestamp = new Date("2026-04-01T12:00:00.000Z")

    const result = updateIssueCentroid({
      centroid: {
        ...createIssueCentroid(),
        clusteredAt: timestamp,
      },
      score: {
        embedding: makeVector([
          [0, 3],
          [1, 4],
        ]),
        source: "evaluation",
        createdAt: new Date(timestamp.getTime() + halfLifeMilliseconds),
      },
      operation: "add",
      timestamp,
    })

    expect(result.clusteredAt).toEqual(timestamp)
    expect(result.base[0]).toBeCloseTo(0.48)
    expect(result.base[1]).toBeCloseTo(0.64)
    expect(result.mass).toBeCloseTo(CENTROID_SOURCE_WEIGHTS.evaluation)
  })

  it("decays existing state from clusteredAt and applies score recency", () => {
    const clusteredAt = new Date("2026-01-01T00:00:00.000Z")
    const timestamp = new Date(clusteredAt.getTime() + halfLifeMilliseconds)

    const result = updateIssueCentroid({
      centroid: {
        ...makeCentroid({
          base: makeVector([[0, 2]]),
          mass: 4,
        }),
        clusteredAt,
      },
      score: {
        embedding: makeVector([[1, 3]]),
        source: "annotation",
        createdAt: clusteredAt,
      },
      operation: "add",
      timestamp,
    })

    expect(result.base[0]).toBeCloseTo(1)
    expect(result.base[1]).toBeCloseTo(0.5)
    expect(result.mass).toBeCloseTo(2.5)
  })

  it("zeros base and mass when removal would drive mass non-positive", () => {
    const timestamp = new Date("2026-04-01T12:00:00.000Z")

    const result = updateIssueCentroid({
      centroid: {
        ...makeCentroid({
          base: makeVector([[0, 0.5]]),
          mass: 0.5,
        }),
        clusteredAt: timestamp,
      },
      score: {
        embedding: makeVector([[0, 1]]),
        source: "annotation",
        createdAt: timestamp,
      },
      operation: "remove",
      timestamp,
    })

    expect(result.clusteredAt).toEqual(timestamp)
    expect(result.mass).toBe(0)
    expect(result.base.every((value) => value === 0)).toBe(true)
  })

  it("normalizes centroid vectors for search and skips empty centroids", () => {
    const vector = normalizeIssueCentroid(
      makeCentroid({
        base: makeVector([
          [0, 3],
          [1, 4],
        ]),
        mass: 2,
      }),
    )

    expect(vector[0]).toBeCloseTo(0.6)
    expect(vector[1]).toBeCloseTo(0.8)
    expect(normalizeIssueCentroid(createIssueCentroid())).toEqual([])
  })

  it("normalizes raw embeddings", () => {
    const normalized = normalizeEmbedding([3, 4])

    expect(normalized[0]).toBeCloseTo(0.6)
    expect(normalized[1]).toBeCloseTo(0.8)
    expect(normalizeEmbedding([])).toEqual([])
  })

  it("fails fast on embedding dimension mismatches", () => {
    const timestamp = new Date("2026-04-01T12:00:00.000Z")

    expect(() =>
      updateIssueCentroid({
        centroid: {
          ...createIssueCentroid(),
          clusteredAt: timestamp,
        },
        score: {
          embedding: [1, 0],
          source: "annotation",
          createdAt: timestamp,
        },
        operation: "add",
        timestamp,
      }),
    ).toThrow("Dimension mismatch: centroid has 2048, score has 2")
  })
})

describe("issue lifecycle helpers", () => {
  const now = new Date("2026-04-10T00:00:00.000Z")

  it("computes the minimum integer occurrences needed to cross the escalation threshold", () => {
    expect(getEscalationOccurrenceThreshold(0)).toBe(20)
    expect(getEscalationOccurrenceThreshold(1)).toBe(20)
    expect(getEscalationOccurrenceThreshold(2)).toBe(20)
    expect(getEscalationOccurrenceThreshold(2.5)).toBe(20)
    expect(getEscalationOccurrenceThreshold(16)).toBe(22)
  })

  it("marks recently created issues as new", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-04-05T08:00:00.000Z"),
        updatedAt: new Date("2026-04-05T08:00:00.000Z"),
        clusteredAt: new Date("2026-04-05T08:00:00.000Z"),
      }),
      isEscalating: false,
      isRegressed: false,
      now,
    })

    expect(states).toEqual([IssueState.New])
  })

  it("marks the issue as escalating when the lifecycle flag is true", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-20T08:00:00.000Z"),
        updatedAt: new Date("2026-03-20T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
      }),
      isEscalating: true,
      isRegressed: false,
      now,
    })

    expect(states).toEqual([IssueState.Escalating])
  })

  it("does not mark as escalating when the flag is false", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-20T08:00:00.000Z"),
        updatedAt: new Date("2026-03-20T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
      }),
      isEscalating: false,
      isRegressed: false,
      now,
    })

    expect(states).toEqual([IssueState.Ongoing])
  })

  it("marks the issue as regressed when isRegressed is true and resolvedAt is null", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-01T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-01T08:00:00.000Z"),
        resolvedAt: null,
      }),
      isEscalating: false,
      isRegressed: true,
      now,
    })

    expect(states).toEqual([IssueState.Regressed])
  })

  it("treats explicitly resolved issues as resolved even if a regression incident exists", () => {
    // resolvedAt being set means the user has acknowledged the regression
    // by resolving again. Take that signal as authoritative — the regression
    // history still lives in alert_incidents for surfacing separately.
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-01T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-01T08:00:00.000Z"),
        resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      }),
      isEscalating: false,
      isRegressed: true,
      now,
    })

    expect(states).toEqual([IssueState.Resolved])
  })

  it("derives both new and ignored when the issue is brand new and ignored", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-04-06T08:00:00.000Z"),
        updatedAt: new Date("2026-04-06T08:00:00.000Z"),
        clusteredAt: new Date("2026-04-06T08:00:00.000Z"),
        ignoredAt: new Date("2026-04-08T08:00:00.000Z"),
      }),
      isEscalating: false,
      isRegressed: false,
      now,
    })

    expect(states).toEqual([IssueState.New, IssueState.Ignored])
  })

  it("marks older active issues with no specific lifecycle signal as ongoing", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-15T08:00:00.000Z"),
        updatedAt: new Date("2026-03-15T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-15T08:00:00.000Z"),
      }),
      isEscalating: false,
      isRegressed: false,
      now,
    })

    expect(states).toEqual([IssueState.Ongoing])
  })
})

describe("evaluateSeasonalEscalation", () => {
  const now = new Date("2026-05-08T12:00:00.000Z")

  const baseSignals = (overrides: Partial<IssueEscalationSignals> = {}): IssueEscalationSignals => ({
    issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
    recent1h: 0,
    recent6h: 0,
    recent24h: 0,
    expected1h: 10,
    expected6hPerHour: 10,
    stddev1h: 2,
    stddev6hPerHour: 2,
    samplesCount: 4,
    ...overrides,
  })

  const makeSnapshot = (overrides: Partial<EntrySignalsSnapshot> = {}): EntrySignalsSnapshot => ({
    expected1h: 10,
    expected6hPerHour: 10,
    stddev1h: 2,
    stddev6hPerHour: 2,
    kShort: 3,
    kLong: 2,
    entryThreshold1h: 16,
    entryThreshold6hPerHour: 14,
    entryCount24h: 240,
    ...overrides,
  })

  it("enters when both windows exceed their bands at default k", () => {
    // expected1h=10, σ=2, k=3 → band=16. recent1h=20 > 16.
    // expected6hPerHour=10, σ=2, k_long=2 → band=14. recent6hPerHour=20 > 14.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 20, recent6h: 120, recent24h: 240 }),
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("enter")
    expect(decision.entrySignalsSnapshot).toMatchObject({
      expected1h: 10,
      kShort: 3,
      kLong: 2,
      entryCount24h: 240,
    })
    expect(decision.nextExitEligibleSince).toBeNull()
  })

  it("does not enter when only the 1h window exceeds its band", () => {
    const decision = evaluateSeasonalEscalation({
      // Big spike for one hour, sustained rate stays normal.
      signals: baseSignals({ recent1h: 20, recent6h: 60, recent24h: 240 }),
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
  })

  it("does not enter when isNew (issue-age guard)", () => {
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 100, recent6h: 600, recent24h: 2400 }),
      kShort: 3,
      isNew: true,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
  })

  it("inflates k by +1 when seasonal samples are thin", () => {
    // samplesCount=1 → kAdj=4. band1h = 10 + 4·2 = 18. recent1h=17 should not trip.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 17, recent6h: 102, recent24h: 240, samplesCount: 1 }),
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
  })

  it("falls through to floor when samplesCount === 0", () => {
    // Deep cold start: enter if recent6h ≥ 20 AND recent1h ≥ 20/6.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({
        recent1h: 5,
        recent6h: 25,
        recent24h: 100,
        samplesCount: 0,
        expected1h: 0,
        expected6hPerHour: 0,
        stddev1h: 0,
        stddev6hPerHour: 0,
      }),
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("enter")
  })

  it("applies the variance floor — quiet bucket with one spike does not trip", () => {
    // expected=0, σ=0. Without the floor, any non-zero recent would trip.
    // With σ_eff = max(0, sqrt(0), 1.0) = 1.0, band1h = 0 + 3·1 = 3.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({
        recent1h: 1,
        recent6h: 1,
        recent24h: 1,
        expected1h: 0,
        expected6hPerHour: 0,
        stddev1h: 0,
        stddev6hPerHour: 0,
      }),
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
  })

  it("starts the dwell tracker when the exit shape first holds", () => {
    // wasEscalating, both windows below their exit bands. exitBand1h = 10 + 0.7·3·2 = 14.2.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 5, recent6h: 30, recent24h: 200 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: makeSnapshot(),
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
    expect(decision.nextExitEligibleSince).toEqual(now)
  })

  it("closes via threshold once the dwell duration is met", () => {
    const dwellStart = new Date(now.getTime() - ESCALATION_EXIT_DWELL_MS)
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 5, recent6h: 30, recent24h: 200 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: makeSnapshot(),
      startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      exitEligibleSince: dwellStart,
      now,
    })

    expect(decision.transition).toBe("exit")
    expect(decision.reason).toBe("threshold")
  })

  it("clears the dwell when the exit shape stops holding", () => {
    // recent1h=20 → above the exit band again.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 20, recent6h: 120, recent24h: 240 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: makeSnapshot(),
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      exitEligibleSince: new Date(now.getTime() - 10 * 60 * 1000),
      now,
    })

    expect(decision.transition).toBe("none")
    expect(decision.nextExitEligibleSince).toBeNull()
  })

  it("force-closes via absolute-rate backstop when 24h count halves vs entry", () => {
    // recent24h=100 < entryCount24h=240 · 0.5 = 120 → trip backstop, even though
    // the band shape might still be elevated (recent1h=20 > exit band).
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 20, recent6h: 120, recent24h: 100 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: makeSnapshot({ entryCount24h: 240 }),
      startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("exit")
    expect(decision.reason).toBe("absolute-rate-drop")
  })

  it("force-closes via timeout once 72h elapses, regardless of band or backstop", () => {
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 100, recent6h: 600, recent24h: 2400 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: makeSnapshot({ entryCount24h: 240 }),
      startedAt: new Date(now.getTime() - ESCALATION_MAX_DURATION_MS - 60 * 1000),
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("exit")
    expect(decision.reason).toBe("timeout")
  })

  it("legacy incident (entrySignals=null) skips backstop but still honours timeout + band exit", () => {
    // No backstop possible — should fall through to band-shape dwell.
    const decision = evaluateSeasonalEscalation({
      signals: baseSignals({ recent1h: 5, recent6h: 30, recent24h: 50 }),
      kShort: 3,
      isNew: false,
      wasEscalating: true,
      entrySignals: null,
      startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      exitEligibleSince: null,
      now,
    })

    expect(decision.transition).toBe("none")
    expect(decision.nextExitEligibleSince).toEqual(now)
  })

  it("higher kShort widens the band and avoids the FP that k=3 catches", () => {
    // signals that just barely cross at k=3 should not cross at k=6.
    // σ_effective = max(stddev=2, sqrt(expected=10)=3.16, 1) = 3.16. At k=3
    // the 1h band is ~19.5 and the 6h-per-hour band is ~16.3; at k=6 they
    // widen to ~29 and ~25.8. recent1h=25 / recent6hPerHour=20 trips the
    // former and clears under the latter.
    const signals = baseSignals({ recent1h: 25, recent6h: 120, recent24h: 240 })

    const noisy = evaluateSeasonalEscalation({
      signals,
      kShort: 3,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })
    const quiet = evaluateSeasonalEscalation({
      signals,
      kShort: 6,
      isNew: false,
      wasEscalating: false,
      entrySignals: null,
      startedAt: null,
      exitEligibleSince: null,
      now,
    })

    expect(noisy.transition).toBe("enter")
    expect(quiet.transition).toBe("none")
  })
})
