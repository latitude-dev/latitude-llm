import type { IssueOccurrenceAggregate } from "@domain/scores"
import { IssueId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_HALF_LIFE_SECONDS, CENTROID_SOURCE_WEIGHTS } from "./constants.ts"
import { type Issue, type IssueCentroid, IssueState } from "./entities/issue.ts"
import {
  createIssueCentroid,
  deriveIssueLifecycleStates,
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
  organizationId: "oooooooooooooooooooooooo",
  projectId: "pppppppppppppppppppppppp",
  name: "Secret leakage",
  description: "The assistant reveals internal credentials.",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const makeOccurrence = (overrides: Partial<IssueOccurrenceAggregate> = {}): IssueOccurrenceAggregate => ({
  issueId: IssueId("iiiiiiiiiiiiiiiiiiiiiiii"),
  totalOccurrences: 3,
  recentOccurrences: 1,
  baselineAvgOccurrences: 1,
  firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
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

  it("does not mark new issues as escalating even when they exceed the escalation threshold", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-04-05T08:00:00.000Z"),
        updatedAt: new Date("2026-04-05T08:00:00.000Z"),
        clusteredAt: new Date("2026-04-05T08:00:00.000Z"),
      }),
      occurrence: makeOccurrence({
        firstSeenAt: new Date("2026-04-05T08:00:00.000Z"),
        lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
        recentOccurrences: 20,
        baselineAvgOccurrences: 2,
      }),
      now,
    })

    expect(states).toEqual([IssueState.New])
  })

  it("marks older issues as escalating when they exceed the escalation threshold", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-20T08:00:00.000Z"),
        updatedAt: new Date("2026-03-20T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
      }),
      occurrence: makeOccurrence({
        firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
        lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
        recentOccurrences: 20,
        baselineAvgOccurrences: 2,
      }),
      now,
    })

    expect(states).toEqual([IssueState.Escalating])
  })

  it("marks issues resolved after 14 days of inactivity", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-01T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-01T08:00:00.000Z"),
      }),
      occurrence: makeOccurrence({
        firstSeenAt: new Date("2026-03-01T08:00:00.000Z"),
        lastSeenAt: new Date("2026-03-20T08:00:00.000Z"),
        recentOccurrences: 0,
        baselineAvgOccurrences: 0,
      }),
      now,
    })

    expect(states).toEqual([IssueState.Resolved])
  })

  it("marks resolved issues as regressed when new occurrences appear later", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-01T08:00:00.000Z"),
        clusteredAt: new Date("2026-03-01T08:00:00.000Z"),
        resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      }),
      occurrence: makeOccurrence({
        firstSeenAt: new Date("2026-03-01T08:00:00.000Z"),
        lastSeenAt: new Date("2026-04-05T08:00:00.000Z"),
        recentOccurrences: 0,
        baselineAvgOccurrences: 0,
      }),
      now,
    })

    expect(states).toEqual([IssueState.Regressed])
  })

  it("falls back to issue timestamps when analytics have not caught up yet", () => {
    const states = deriveIssueLifecycleStates({
      issue: makeIssue({
        createdAt: new Date("2026-04-06T08:00:00.000Z"),
        updatedAt: new Date("2026-04-06T08:00:00.000Z"),
        clusteredAt: new Date("2026-04-06T08:00:00.000Z"),
        ignoredAt: new Date("2026-04-08T08:00:00.000Z"),
      }),
      occurrence: null,
      now,
    })

    expect(states).toEqual([IssueState.New, IssueState.Ignored])
  })
})
