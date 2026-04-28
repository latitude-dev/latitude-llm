import { type EvaluationListPage, EvaluationRepository, type EvaluationRepositoryShape } from "@domain/evaluations"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { buildIssuesExportUseCase } from "./build-issues-export.ts"

const encoder = new TextEncoder()
const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeIssue = (overrides: Partial<Issue> = {}): Issue =>
  ({
    id: IssueId("i".repeat(24)),
    uuid: "11111111-1111-4111-8111-111111111111",
    organizationId,
    projectId,
    name: "Issue candidate",
    description: "Repeated assistant failure",
    source: "annotation",
    kind: "regular",
    centroid: createIssueCentroid(),
    clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  }) satisfies Issue

const emptyEvaluationPage: EvaluationListPage = {
  items: [],
  hasMore: false,
  limit: 0,
  offset: 0,
}

const createEvaluationRepository = (): EvaluationRepositoryShape => ({
  findById: () => Effect.die("Unexpected EvaluationRepository.findById"),
  save: () => Effect.die("Unexpected EvaluationRepository.save"),
  listByProjectId: () => Effect.die("Unexpected EvaluationRepository.listByProjectId"),
  listByIssueId: () => Effect.die("Unexpected EvaluationRepository.listByIssueId"),
  listByIssueIds: () => Effect.succeed(emptyEvaluationPage),
  archive: () => Effect.die("Unexpected EvaluationRepository.archive"),
  unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive"),
  softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete"),
  softDeleteByIssueId: () => Effect.die("Unexpected EvaluationRepository.softDeleteByIssueId"),
})

describe("buildIssuesExportUseCase", () => {
  it("applies lifecycle filtering, selected rows, sort order, and time range", async () => {
    const activeIssue = makeIssue({
      id: IssueId("a".repeat(24)),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Active issue",
    })
    const archivedIssue = makeIssue({
      id: IssueId("b".repeat(24)),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Archived issue",
      ignoredAt: new Date("2026-04-04T00:00:00.000Z"),
    })
    const secondArchivedIssue = makeIssue({
      id: IssueId("c".repeat(24)),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Second archived issue",
      ignoredAt: new Date("2026-04-05T00:00:00.000Z"),
    })
    const { repository: issueRepository } = createFakeIssueRepository([activeIssue, archivedIssue, secondArchivedIssue])
    const timeRangeCalls: Array<{ from?: Date; to?: Date } | undefined> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: (input) =>
        Effect.sync(() => {
          timeRangeCalls.push(input.timeRange)
          return [
            {
              issueId: activeIssue.id,
              occurrences: 2,
              firstSeenAt: new Date("2026-04-20T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-21T00:00:00.000Z"),
            },
            {
              issueId: archivedIssue.id,
              occurrences: 5,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-05T00:00:00.000Z"),
            },
            {
              issueId: secondArchivedIssue.id,
              occurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ]
        }),
      aggregateByIssues: ({ issueIds }) =>
        Effect.succeed(
          [
            {
              issueId: activeIssue.id,
              totalOccurrences: 2,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-20T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-21T00:00:00.000Z"),
            },
            {
              issueId: archivedIssue.id,
              totalOccurrences: 5,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-05T00:00:00.000Z"),
            },
            {
              issueId: secondArchivedIssue.id,
              totalOccurrences: 1,
              recentOccurrences: 0,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ].filter((occurrence) => issueIds.includes(occurrence.issueId)),
        ),
      countDistinctTracesByTimeRange: () => Effect.succeed(10),
    })

    const result = await Effect.runPromise(
      buildIssuesExportUseCase({
        organizationId,
        projectId,
        selection: { mode: "selected", rowIds: [activeIssue.id, secondArchivedIssue.id, archivedIssue.id] },
        lifecycleGroup: "archived",
        sort: { field: "occurrences", direction: "asc" },
        timeRange: {
          from: new Date("2026-04-01T00:00:00.000Z"),
          to: new Date("2026-04-10T00:00:00.000Z"),
        },
      }).pipe(
        Effect.provideService(IssueProjectionRepository, {
          upsert: () => Effect.void,
          delete: () => Effect.void,
          hybridSearch: () => Effect.succeed([]),
        }),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(EvaluationRepository, createEvaluationRepository()),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
      ),
    )

    const lines = result.csv.split("\n")

    expect(lines[1]).toContain(secondArchivedIssue.id)
    expect(lines[2]).toContain(archivedIssue.id)
    expect(result.csv).not.toContain(activeIssue.id)
    expect(timeRangeCalls).toEqual([
      {
        from: new Date("2026-04-01T00:00:00.000Z"),
        to: new Date("2026-04-10T00:00:00.000Z"),
      },
    ])
  })

  it("applies search scoping before exporting issues", async () => {
    const firstIssue = makeIssue({
      id: IssueId("a".repeat(24)),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Timeout issue",
    })
    const secondIssue = makeIssue({
      id: IssueId("b".repeat(24)),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Rate limit issue",
    })
    const { repository: issueRepository } = createFakeIssueRepository([firstIssue, secondIssue])
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
          {
            issueId: firstIssue.id,
            occurrences: 3,
            firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
          },
          {
            issueId: secondIssue.id,
            occurrences: 4,
            firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
          },
        ]),
      aggregateByIssues: ({ issueIds }) =>
        Effect.succeed(
          [
            {
              issueId: firstIssue.id,
              totalOccurrences: 3,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
            },
            {
              issueId: secondIssue.id,
              totalOccurrences: 4,
              recentOccurrences: 2,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ].filter((occurrence) => issueIds.includes(occurrence.issueId)),
        ),
      countDistinctTracesByTimeRange: () => Effect.succeed(10),
    })

    const result = await Effect.runPromise(
      buildIssuesExportUseCase({
        organizationId,
        projectId,
        search: {
          query: "rate limit",
          normalizedEmbedding: Array.from(encoder.encode("rate-limit"), (value) => value / 255),
        },
      }).pipe(
        Effect.provideService(IssueProjectionRepository, {
          upsert: () => Effect.void,
          delete: () => Effect.void,
          hybridSearch: () =>
            Effect.succeed([
              {
                uuid: secondIssue.uuid,
                title: secondIssue.name,
                description: secondIssue.description,
                score: 0.9,
              },
            ]),
        }),
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(EvaluationRepository, createEvaluationRepository()),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
      ),
    )

    expect(result.csv).toContain(secondIssue.id)
    expect(result.csv).not.toContain(firstIssue.id)
  })
})
