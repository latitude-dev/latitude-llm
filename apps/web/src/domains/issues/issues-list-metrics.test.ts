import type { ListIssuesResult } from "@domain/issues"
import { describe, expect, it } from "vitest"
import { buildIssuesTraceCountFilters, withIssuesTraceTotals } from "./issues-list-metrics.ts"

const makeListIssuesResult = (): ListIssuesResult => ({
  analytics: {
    counts: {
      newIssues: 0,
      escalatingIssues: 0,
      ongoingIssues: 0,
      regressedIssues: 0,
      resolvedIssues: 0,
      seenOccurrences: 0,
    },
    histogram: [],
    totalTraces: 79,
  },
  items: [
    {
      id: "issue-a",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectId: "project-1",
      name: "Issue A",
      description: "First issue",
      source: "annotation",
      kind: "regular",
      states: [],
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      escalatedAt: null,
      resolvedAt: null,
      ignoredAt: null,
      firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
      occurrences: 25,
      similarityScore: null,
      affectedTracesPercent: 0.32,
      escalationOccurrenceThreshold: null,
      trend: [],
      evaluations: [],
      tags: [],
    },
    {
      id: "issue-b",
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectId: "project-1",
      name: "Issue B",
      description: "Second issue",
      source: "annotation",
      kind: "regular",
      states: [],
      createdAt: new Date("2026-04-02T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      escalatedAt: null,
      resolvedAt: null,
      ignoredAt: null,
      firstSeenAt: new Date("2026-04-02T00:00:00.000Z"),
      lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
      occurrences: 5,
      similarityScore: null,
      affectedTracesPercent: 0.06,
      escalationOccurrenceThreshold: null,
      trend: [],
      evaluations: [],
      tags: [],
    },
  ],
  totalCount: 2,
  hasMore: false,
  limit: 50,
  offset: 0,
  occurrencesSum: 30,
})

describe("issues-list-metrics", () => {
  it("builds trace count filters from the selected time range", () => {
    expect(buildIssuesTraceCountFilters(undefined)).toBeUndefined()
    expect(
      buildIssuesTraceCountFilters({
        fromIso: "2026-04-01T00:00:00.000Z",
        toIso: "2026-04-10T23:59:59.999Z",
      }),
    ).toEqual({
      startTime: [
        { op: "gte", value: "2026-04-01T00:00:00.000Z" },
        { op: "lte", value: "2026-04-10T23:59:59.999Z" },
      ],
    })
  })

  it("recomputes affected trace percentages from the full trace total", () => {
    const result = withIssuesTraceTotals(makeListIssuesResult(), 2_100)

    expect(result.analytics.totalTraces).toBe(2_100)
    expect(result.items[0]?.affectedTracesPercent).toBeCloseTo(25 / 2_100)
    expect(result.items[1]?.affectedTracesPercent).toBeCloseTo(5 / 2_100)
  })

  it("caps affected trace percentages at one hundred percent", () => {
    const result = withIssuesTraceTotals(makeListIssuesResult(), 20)

    expect(result.items[0]?.affectedTracesPercent).toBe(1)
  })
})
