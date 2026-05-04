import { AI, AIError, type AIShape } from "@domain/ai"
import {
  addTracesToDataset,
  createDatasetFromTraces,
  DatasetNotFoundError,
  DatasetRepository,
  DatasetRowRepository,
  type DatasetRowRepositoryShape,
} from "@domain/datasets"
import { createFakeDatasetRepository } from "@domain/datasets/testing"
import { OutboxEventWriter } from "@domain/events"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import {
  bootstrapSeedScope,
  type ChSqlClient,
  DatasetId,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SEED_API_KEY_ID,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared/seeding"
import type { TraceDetail } from "@domain/spans"
import { TRACE_SEARCH_EMBEDDING_DIMENSIONS, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { DatasetRowRepositoryLive } from "../repositories/dataset-row-repository.ts"
import { TraceRepositoryLive } from "../repositories/trace-repository.ts"
import { runSpansSeed } from "../seeds/spans/index.ts"
import { withClickHouse } from "../with-clickhouse.ts"

/** Mock AI layer that provides a fake embedding service for testing. */
const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "Generate not implemented in mock" })),
  embed: () => Effect.succeed({ embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "Rerank not implemented in mock" })),
} as AIShape)

const ORG_ID = OrganizationId("org-add-traces")
const PROJECT_ID = ProjectId("proj-add-traces")
const DATASET_ID = DatasetId("ds-add-traces-existing")

const ch = setupTestClickHouse()

const inertSqlClient: SqlClientShape = {
  organizationId: ORG_ID,
  transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, inertSqlClient)),
  query: () => Effect.die("Fake DatasetRepository must not access SqlClient"),
}

function makeFakeTraceRepository(traces: TraceDetail[]) {
  return createFakeTraceRepository({
    listByTraceIds: () => Effect.succeed(traces),
  }).repository
}

describe("addTracesToDataset and createDatasetFromTraces", () => {
  let datasetRepo: (typeof DatasetRepository)["Service"]
  let rowRepo: DatasetRowRepositoryShape
  let seededTraceIds: readonly TraceId[] = []

  beforeAll(async () => {
    rowRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRowRepository
      }).pipe(withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID)),
    )
  })

  beforeEach(async () => {
    const fake = createFakeDatasetRepository(undefined, undefined, { organizationId: ORG_ID })
    datasetRepo = fake.repository
    await Effect.runPromise(
      datasetRepo
        .create({ id: DATASET_ID, projectId: PROJECT_ID, name: "existing-dataset" })
        .pipe(Effect.provideService(SqlClient, inertSqlClient)),
    )

    seededTraceIds = await Effect.runPromise(
      runSpansSeed(
        { client: ch.client, scope: bootstrapSeedScope },
        {
          traceCount: 2,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          apiKeyId: SEED_API_KEY_ID,
          quiet: true,
        },
      ),
    )
  })

  const runWithLive = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      DatasetRepository | DatasetRowRepository | TraceRepository | ChSqlClient | OutboxEventWriter | SqlClient
    >,
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, inertSqlClient),
        withClickHouse(TraceRepositoryLive.pipe(Layer.provideMerge(mockAILayer)), ch.client, ORG_ID),
        Effect.provide(ChSqlClientLive(ch.client, ORG_ID)),
      ),
    )

  const runWithOverrides = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      DatasetRepository | DatasetRowRepository | TraceRepository | ChSqlClient | OutboxEventWriter | SqlClient
    >,
    services: {
      datasetRepo: (typeof DatasetRepository)["Service"]
      rowRepo: DatasetRowRepositoryShape
      traceRepo: (typeof TraceRepository)["Service"]
    },
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(DatasetRepository, services.datasetRepo),
        Effect.provideService(DatasetRowRepository, services.rowRepo),
        Effect.provideService(TraceRepository, services.traceRepo),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        Effect.provideService(SqlClient, inertSqlClient),
        Effect.provide(ChSqlClientLive(ch.client, ORG_ID)),
      ),
    )

  it("addTracesToDataset adds rows to an existing dataset", async () => {
    const traceId = seededTraceIds[0]
    expect(traceId).toBeDefined()

    const result = await runWithLive(
      addTracesToDataset({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        selection: { mode: "selected", traceIds: [traceId] },
      }),
    )

    expect(result.versionId).toBeTruthy()
    expect(result.version).toBe(1)
    expect(result.rowIds.length).toBe(1)

    const { rows } = await Effect.runPromise(
      rowRepo.list({ datasetId: DATASET_ID }).pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))),
    )
    expect(rows.length).toBe(1)
    expect(rows[0].input).toBeDefined()
    expect(rows[0].output).toBeDefined()
  })

  it("createDatasetFromTraces creates a new dataset and inserts rows", async () => {
    expect(seededTraceIds.length).toBeGreaterThanOrEqual(1)
    const traceIds = seededTraceIds.slice(0, 2)

    const result = await runWithLive(
      createDatasetFromTraces({
        projectId: PROJECT_ID,
        name: "from-traces-dataset",
        selection: { mode: "selected", traceIds },
      }),
    )

    expect(result.datasetId).toBeDefined()
    expect(result.version).toBe(1)
    expect(result.rowIds.length).toBe(traceIds.length)

    const dataset = await Effect.runPromise(
      datasetRepo.findById(result.datasetId).pipe(Effect.provideService(SqlClient, inertSqlClient)),
    )
    expect(dataset.name).toBe("from-traces-dataset")

    const { rows } = await Effect.runPromise(
      rowRepo.list({ datasetId: result.datasetId }).pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))),
    )
    expect(rows.length).toBe(traceIds.length)
    for (const row of rows) {
      expect(row.input).toBeDefined()
      expect(row.output).toBeDefined()
    }
  })

  it("addTracesToDataset copies user-defined trace metadata into the row metadata", async () => {
    const fakeTraceRepo = makeFakeTraceRepository([
      {
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        traceId: TraceId("trace-meta-1"),
        spanCount: 1,
        errorCount: 0,
        startTime: new Date(),
        endTime: new Date(),
        durationNs: 0,
        timeToFirstTokenNs: 0,
        tokensInput: 0,
        tokensOutput: 0,
        tokensCacheRead: 0,
        tokensCacheCreate: 0,
        tokensReasoning: 0,
        tokensTotal: 0,
        costInputMicrocents: 0,
        costOutputMicrocents: 0,
        costTotalMicrocents: 0,
        sessionId: SessionId(""),
        userId: ExternalUserId(""),
        simulationId: SimulationId(""),
        tags: [],
        metadata: { user_name: "Ada", topic: "regression-testing" },
        models: [],
        providers: [],
        serviceNames: [],
        rootSpanId: SpanId("span-1"),
        rootSpanName: "root",
        systemInstructions: [],
        inputMessages: [],
        outputMessages: [],
        allMessages: [],
      },
    ])

    await runWithOverrides(
      addTracesToDataset({
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        selection: { mode: "selected", traceIds: [TraceId("trace-meta-1")] },
      }),
      { datasetRepo, rowRepo, traceRepo: fakeTraceRepo },
    )

    const { rows } = await Effect.runPromise(
      rowRepo.list({ datasetId: DATASET_ID }).pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))),
    )
    const row = rows.find((r) => {
      const meta = r.metadata as Record<string, unknown>
      return meta.traceId === "trace-meta-1"
    })
    expect(row).toBeDefined()
    const metadata = row?.metadata as Record<string, unknown>
    expect(metadata.traceMetadata).toEqual({ user_name: "Ada", topic: "regression-testing" })
  })

  it("createDatasetFromTraces soft-deletes the dataset when ClickHouse insert fails", async () => {
    const fakeTraceRepo = makeFakeTraceRepository([
      {
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        traceId: TraceId("trace-fail-1"),
        spanCount: 1,
        errorCount: 0,
        startTime: new Date(),
        endTime: new Date(),
        durationNs: 0,
        timeToFirstTokenNs: 0,
        tokensInput: 0,
        tokensOutput: 0,
        tokensCacheRead: 0,
        tokensCacheCreate: 0,
        tokensReasoning: 0,
        tokensTotal: 0,
        costInputMicrocents: 0,
        costOutputMicrocents: 0,
        costTotalMicrocents: 0,
        sessionId: SessionId(""),
        userId: ExternalUserId(""),
        simulationId: SimulationId(""),
        tags: [],
        metadata: {},
        models: [],
        providers: [],
        serviceNames: [],
        rootSpanId: SpanId("span-1"),
        rootSpanName: "root",
        systemInstructions: [],
        inputMessages: [],
        outputMessages: [],
        allMessages: [],
      },
    ])

    const failingRowRepo: DatasetRowRepositoryShape = {
      ...rowRepo,
      insertBatch: () =>
        Effect.fail(
          new RepositoryError({
            cause: new Error("injected insert failure"),
            operation: "insertBatch",
          }),
        ),
    }

    let createdDatasetId: DatasetId | null = null
    const capturingDatasetRepo: (typeof DatasetRepository)["Service"] = {
      ...datasetRepo,
      create: (args) =>
        datasetRepo.create(args).pipe(
          Effect.tap((dataset) =>
            Effect.sync(() => {
              createdDatasetId = dataset.id
            }),
          ),
        ),
    }

    await expect(
      runWithOverrides(
        createDatasetFromTraces({
          projectId: PROJECT_ID,
          name: "rollback-on-fail",
          selection: { mode: "selected", traceIds: [TraceId("trace-fail-1")] },
        }),
        {
          datasetRepo: capturingDatasetRepo,
          rowRepo: failingRowRepo,
          traceRepo: fakeTraceRepo,
        },
      ),
    ).rejects.toBeInstanceOf(RepositoryError)

    expect(createdDatasetId).not.toBeNull()
    const id = createdDatasetId
    if (id === null) return

    await expect(
      Effect.runPromise(capturingDatasetRepo.findById(id).pipe(Effect.provideService(SqlClient, inertSqlClient))),
    ).rejects.toBeInstanceOf(DatasetNotFoundError)
  })
})
