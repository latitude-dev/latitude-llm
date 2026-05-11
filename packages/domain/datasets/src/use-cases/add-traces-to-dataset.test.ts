import { OutboxEventWriter } from "@domain/events"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, type FilterSet, IssueId, OrganizationId, SqlClient, type TraceId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository, type DatasetRowRepositoryShape } from "../ports/dataset-row-repository.ts"
import { createFakeDatasetRepository } from "../testing/fake-dataset-repository.ts"
import { addTracesToDataset, createDatasetFromTraces } from "./add-traces-to-dataset.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = "p".repeat(24) as Parameters<typeof addTracesToDataset>[0]["projectId"]
const datasetId = "d".repeat(24) as Parameters<typeof addTracesToDataset>[0]["datasetId"]

// All methods die because the "mode: all" + empty page path returns EMPTY_RESULT
// before touching the row repository. If a future change starts calling these
// on the empty-page path, the test will surface that by dying loudly.
const stubRowRepo: DatasetRowRepositoryShape = {
  findExistingTraceIds: () => Effect.succeed(new Set<TraceId>()),
  insertBatch: () => Effect.die("DatasetRowRepository.insertBatch should not be called"),
  list: () => Effect.die("DatasetRowRepository.list should not be called"),
  count: () => Effect.die("DatasetRowRepository.count should not be called"),
  listPage: () => Effect.die("DatasetRowRepository.listPage should not be called"),
  findById: () => Effect.die("DatasetRowRepository.findById should not be called"),
  updateRow: () => Effect.die("DatasetRowRepository.updateRow should not be called"),
  deleteBatch: () => Effect.die("DatasetRowRepository.deleteBatch should not be called"),
  deleteAll: () => Effect.die("DatasetRowRepository.deleteAll should not be called"),
}

const baseFilters: FilterSet = { tags: [{ op: "contains", value: "important" }] }

const inertSqlClient = {
  organizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die("SqlClient.query should not be called"),
}

const provideAllServices = (overrides: {
  readonly traceRepo: (typeof TraceRepository)["Service"]
  readonly scoreAnalyticsRepo?: (typeof ScoreAnalyticsRepository)["Service"]
}) => {
  const { repository: defaultDatasetRepo } = createFakeDatasetRepository(undefined, undefined, { organizationId })
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(TraceRepository, overrides.traceRepo),
      Effect.provideService(DatasetRowRepository, stubRowRepo),
      Effect.provideService(
        ScoreAnalyticsRepository,
        overrides.scoreAnalyticsRepo ?? createFakeScoreAnalyticsRepository().repository,
      ),
      Effect.provideService(DatasetRepository, defaultDatasetRepo),
      Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
      Effect.provideService(SqlClient, inertSqlClient),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    )
}

describe("addTracesToDataset", () => {
  it("forwards both filters and searchQuery to listByProjectId for mode=all so the resolved set matches the table's filtered+searched view", async () => {
    const calls: Array<{ filters?: FilterSet; searchQuery?: string }> = []
    const { repository: traceRepo } = createFakeTraceRepository({
      listByProjectId: ({ options }) => {
        calls.push({
          ...(options.filters ? { filters: options.filters } : {}),
          ...(options.searchQuery ? { searchQuery: options.searchQuery } : {}),
        })
        return Effect.succeed({ items: [], hasMore: false })
      },
    })

    await Effect.runPromise(
      provideAllServices({ traceRepo })(
        addTracesToDataset({
          projectId,
          datasetId,
          source: { kind: "project" },
          selection: { mode: "all" },
          searchQuery: "checkout flow",
          filters: baseFilters,
        }),
      ),
    )

    expect(calls).toEqual([{ filters: baseFilters, searchQuery: "checkout flow" }])
  })

  it("forwards filters and searchQuery to listByProjectId for mode=allExcept", async () => {
    const calls: Array<{ filters?: FilterSet; searchQuery?: string }> = []
    const { repository: traceRepo } = createFakeTraceRepository({
      listByProjectId: ({ options }) => {
        calls.push({
          ...(options.filters ? { filters: options.filters } : {}),
          ...(options.searchQuery ? { searchQuery: options.searchQuery } : {}),
        })
        return Effect.succeed({ items: [], hasMore: false })
      },
    })

    await Effect.runPromise(
      provideAllServices({ traceRepo })(
        addTracesToDataset({
          projectId,
          datasetId,
          source: { kind: "project" },
          selection: { mode: "allExcept", traceIds: ["t".repeat(32) as TraceId] },
          searchQuery: "payment errors",
          filters: baseFilters,
        }),
      ),
    )

    expect(calls).toEqual([{ filters: baseFilters, searchQuery: "payment errors" }])
  })

  it("omits filters and searchQuery from listByProjectId when neither is supplied", async () => {
    const calls: Array<Record<string, unknown>> = []
    const { repository: traceRepo } = createFakeTraceRepository({
      listByProjectId: ({ options }) => {
        calls.push({ ...options })
        return Effect.succeed({ items: [], hasMore: false })
      },
    })

    await Effect.runPromise(
      provideAllServices({ traceRepo })(
        addTracesToDataset({
          projectId,
          datasetId,
          source: { kind: "project" },
          selection: { mode: "all" },
        }),
      ),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toHaveProperty("filters")
    expect(calls[0]).not.toHaveProperty("searchQuery")
  })

  it("does not forward filters or searchQuery when source is an issue (issue-source ignores both)", async () => {
    const listByProjectIdCalls: number[] = []
    const issueRepoCalls: Array<Record<string, unknown>> = []
    const { repository: traceRepo } = createFakeTraceRepository({
      listByProjectId: () => {
        listByProjectIdCalls.push(1)
        return Effect.succeed({ items: [], hasMore: false })
      },
    })
    const { repository: scoreAnalyticsRepo } = createFakeScoreAnalyticsRepository({
      listTracesByIssue: (args) => {
        issueRepoCalls.push({ ...args })
        return Effect.succeed({ items: [], hasMore: false, limit: 1_000, offset: 0 })
      },
    })

    await Effect.runPromise(
      provideAllServices({ traceRepo, scoreAnalyticsRepo })(
        addTracesToDataset({
          projectId,
          datasetId,
          source: { kind: "issue", issueId: IssueId("i".repeat(24)) },
          selection: { mode: "all" },
          searchQuery: "ignored on issue source",
          filters: baseFilters,
        }),
      ),
    )

    expect(listByProjectIdCalls).toEqual([])
    expect(issueRepoCalls).toHaveLength(1)
    expect(issueRepoCalls[0]).not.toHaveProperty("filters")
    expect(issueRepoCalls[0]).not.toHaveProperty("searchQuery")
  })
})

describe("createDatasetFromTraces", () => {
  it("forwards both filters and searchQuery to listByProjectId for mode=all", async () => {
    const calls: Array<{ filters?: FilterSet; searchQuery?: string }> = []
    const { repository: traceRepo } = createFakeTraceRepository({
      listByProjectId: ({ options }) => {
        calls.push({
          ...(options.filters ? { filters: options.filters } : {}),
          ...(options.searchQuery ? { searchQuery: options.searchQuery } : {}),
        })
        return Effect.succeed({ items: [], hasMore: false })
      },
    })

    await Effect.runPromise(
      provideAllServices({ traceRepo })(
        createDatasetFromTraces({
          projectId,
          name: "search-derived",
          source: { kind: "project" },
          selection: { mode: "all" },
          searchQuery: "vector",
          filters: baseFilters,
        }),
      ),
    )

    expect(calls).toEqual([{ filters: baseFilters, searchQuery: "vector" }])
  })
})
