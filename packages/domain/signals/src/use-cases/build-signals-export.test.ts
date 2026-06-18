import { type EvaluationListPage, EvaluationRepository, type EvaluationRepositoryShape } from "@domain/evaluations"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { buildSignalsExportUseCase } from "./build-signals-export.ts"

const encoder = new TextEncoder()
const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeSignal = (overrides: Partial<Signal> = {}): Signal =>
  ({
    id: SignalId("i".repeat(24)),
    slug: "test-issue",
    organizationId,
    projectId,
    name: "Signal candidate",
    description: "Repeated assistant failure",
    source: "annotation",
    assigneeId: null,
    priority: null,
    centroid: createSignalCentroid(),
    clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  }) satisfies Signal

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
  listBySignalId: () => Effect.die("Unexpected EvaluationRepository.listBySignalId"),
  listBySignalIds: () => Effect.succeed(emptyEvaluationPage),
  archive: () => Effect.die("Unexpected EvaluationRepository.archive"),
  unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive"),
  softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete"),
  softDeleteBySignalId: () => Effect.die("Unexpected EvaluationRepository.softDeleteBySignalId"),
})

describe("buildSignalsExportUseCase", () => {
  it("applies lifecycle filtering, selected rows, sort order, and time range", async () => {
    const activeSignal = makeSignal({
      id: SignalId("a".repeat(24)),
      name: "Active issue",
    })
    const archivedSignal = makeSignal({
      id: SignalId("b".repeat(24)),
      name: "Archived issue",
      ignoredAt: new Date("2026-04-04T00:00:00.000Z"),
    })
    const secondArchivedSignal = makeSignal({
      id: SignalId("c".repeat(24)),
      name: "Second archived issue",
      ignoredAt: new Date("2026-04-05T00:00:00.000Z"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([
      activeSignal,
      archivedSignal,
      secondArchivedSignal,
    ])
    const timeRangeCalls: Array<{ from?: Date; to?: Date } | undefined> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: (input) =>
        Effect.sync(() => {
          timeRangeCalls.push(input.timeRange)
          return [
            {
              signalId: activeSignal.id,
              occurrences: 2,
              firstSeenAt: new Date("2026-04-20T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-21T00:00:00.000Z"),
            },
            {
              signalId: archivedSignal.id,
              occurrences: 5,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-05T00:00:00.000Z"),
            },
            {
              signalId: secondArchivedSignal.id,
              occurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ]
        }),
      aggregateBySignals: ({ signalIds }) =>
        Effect.succeed(
          [
            {
              signalId: activeSignal.id,
              totalOccurrences: 2,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-20T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-21T00:00:00.000Z"),
            },
            {
              signalId: archivedSignal.id,
              totalOccurrences: 5,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-05T00:00:00.000Z"),
            },
            {
              signalId: secondArchivedSignal.id,
              totalOccurrences: 1,
              recentOccurrences: 0,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ].filter((occurrence) => signalIds.includes(occurrence.signalId)),
        ),
      countDistinctTracesByTimeRange: () => Effect.succeed(10),
    })

    const result = await Effect.runPromise(
      buildSignalsExportUseCase({
        organizationId,
        projectId,
        selection: { mode: "selected", rowIds: [activeSignal.id, secondArchivedSignal.id, archivedSignal.id] },
        lifecycleGroup: "archived",
        sort: { field: "occurrences", direction: "asc" },
        timeRange: {
          from: new Date("2026-04-01T00:00:00.000Z"),
          to: new Date("2026-04-10T00:00:00.000Z"),
        },
        now: new Date("2026-04-25T00:00:00.000Z"),
      }).pipe(
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(EvaluationRepository, createEvaluationRepository()),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
        Effect.provideService(
          TraceRepository,
          createFakeTraceRepository({ countByProjectId: () => Effect.succeed(10) }).repository,
        ),
      ),
    )

    const lines = result.csv.split("\n")

    expect(lines[1]).toContain(secondArchivedSignal.id)
    expect(lines[2]).toContain(archivedSignal.id)
    expect(result.csv).not.toContain(activeSignal.id)
    expect(timeRangeCalls).toEqual([
      {
        from: new Date("2026-04-01T00:00:00.000Z"),
        to: new Date("2026-04-10T00:00:00.000Z"),
      },
    ])
  })

  it("applies search scoping before exporting issues", async () => {
    const firstSignal = makeSignal({
      id: SignalId("a".repeat(24)),
      name: "Timeout issue",
    })
    const secondSignal = makeSignal({
      id: SignalId("b".repeat(24)),
      name: "Rate limit issue",
    })
    const { repository: signalRepository } = createFakeSignalRepository([firstSignal, secondSignal], {
      hybridSearch: () =>
        Effect.succeed([
          {
            signalId: secondSignal.id,
            name: secondSignal.name,
            description: secondSignal.description,
            score: 0.9,
          },
        ]),
    })
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          {
            signalId: firstSignal.id,
            occurrences: 3,
            firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
          },
          {
            signalId: secondSignal.id,
            occurrences: 4,
            firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
          },
        ]),
      aggregateBySignals: ({ signalIds }) =>
        Effect.succeed(
          [
            {
              signalId: firstSignal.id,
              totalOccurrences: 3,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
            },
            {
              signalId: secondSignal.id,
              totalOccurrences: 4,
              recentOccurrences: 2,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
            },
          ].filter((occurrence) => signalIds.includes(occurrence.signalId)),
        ),
      countDistinctTracesByTimeRange: () => Effect.succeed(10),
    })

    const result = await Effect.runPromise(
      buildSignalsExportUseCase({
        organizationId,
        projectId,
        search: {
          query: "rate limit",
          normalizedEmbedding: Array.from(encoder.encode("rate-limit"), (value) => value / 255),
        },
      }).pipe(
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(EvaluationRepository, createEvaluationRepository()),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
        Effect.provideService(
          TraceRepository,
          createFakeTraceRepository({ countByProjectId: () => Effect.succeed(10) }).repository,
        ),
      ),
    )

    expect(result.csv).toContain(secondSignal.id)
    expect(result.csv).not.toContain(firstSignal.id)
  })

  it("narrows exported rows to the assignee filter", async () => {
    const userA = "1".repeat(24)
    const assignedSignal = makeSignal({
      id: SignalId("a".repeat(24)),
      name: "Assigned issue",
      assigneeId: userA,
    })
    const unassignedSignal = makeSignal({
      id: SignalId("b".repeat(24)),
      name: "Unassigned issue",
    })
    const { repository: signalRepository } = createFakeSignalRepository([assignedSignal, unassignedSignal])
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed(
          [assignedSignal, unassignedSignal].map((issue) => ({
            signalId: SignalId(issue.id),
            occurrences: 2,
            firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
          })),
        ),
      aggregateBySignals: ({ signalIds }) =>
        Effect.succeed(
          [assignedSignal, unassignedSignal]
            .map((issue) => ({
              signalId: SignalId(issue.id),
              totalOccurrences: 2,
              recentOccurrences: 1,
              baselineAvgOccurrences: 1,
              firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-03T00:00:00.000Z"),
            }))
            .filter((occurrence) => signalIds.includes(occurrence.signalId)),
        ),
      countDistinctTracesByTimeRange: () => Effect.succeed(10),
    })

    const result = await Effect.runPromise(
      buildSignalsExportUseCase({
        organizationId,
        projectId,
        assigneeIds: [userA],
      }).pipe(
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(EvaluationRepository, createEvaluationRepository()),
        Effect.provideService(SignalRepository, signalRepository),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
        Effect.provideService(
          TraceRepository,
          createFakeTraceRepository({ countByProjectId: () => Effect.succeed(10) }).repository,
        ),
      ),
    )

    expect(result.csv).toContain(assignedSignal.id)
    expect(result.csv).not.toContain(unassignedSignal.id)
  })
})
