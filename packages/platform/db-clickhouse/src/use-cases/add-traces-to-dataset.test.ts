import {
  addTracesToDataset,
  createDatasetFromTraces,
  DatasetNotFoundError,
  DatasetRepository,
  DatasetRowRepository,
  type DatasetRowRepositoryShape,
} from "@domain/datasets"
import { OutboxEventWriter } from "@domain/events"
import type { SqlClient } from "@domain/shared"
import {
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
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { DatasetRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { datasets } from "@platform/db-postgres/schema/datasets"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { DatasetRowRepositoryLive } from "../repositories/dataset-row-repository.ts"
import { TraceRepositoryLive } from "../repositories/trace-repository.ts"
import { runSpansSeed } from "../seeds/spans/index.ts"
import { withClickHouse } from "../with-clickhouse.ts"

const ORG_ID = OrganizationId("org-add-traces")
const PROJECT_ID = ProjectId("proj-add-traces")
const DATASET_ID = DatasetId("ds-add-traces-existing")

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

function makeFakeTraceRepository(traces: TraceDetail[]) {
  return createFakeTraceRepository({
    listByTraceIds: () => Effect.succeed(traces),
  }).repository
}

const runWithLive = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    DatasetRepository | DatasetRowRepository | TraceRepository | ChSqlClient | OutboxEventWriter | SqlClient
  >,
) =>
  Effect.runPromise(
    effect.pipe(
      withPostgres(Layer.mergeAll(DatasetRepositoryLive, OutboxEventWriterLive), pg.adminPostgresClient, ORG_ID),
      withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID),
      withClickHouse(TraceRepositoryLive, ch.client, ORG_ID),
    ),
  )

describe("addTracesToDataset and createDatasetFromTraces", () => {
  let datasetRepo: (typeof DatasetRepository)["Service"]
  let rowRepo: DatasetRowRepositoryShape
  let seededTraceIds: readonly TraceId[] = []

  beforeAll(async () => {
    datasetRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRepository
      }).pipe(
        withPostgres(Layer.mergeAll(DatasetRepositoryLive, OutboxEventWriterLive), pg.adminPostgresClient, ORG_ID),
      ),
    )

    rowRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRowRepository
      }).pipe(withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID)),
    )

    await pg.db.insert(datasets).values({
      id: DATASET_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "existing-dataset",
      currentVersion: 0,
    })
  })

  beforeEach(async () => {
    seededTraceIds = await Effect.runPromise(
      runSpansSeed(
        { client: ch.client },
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
        Effect.provide(ChSqlClientLive(ch.client, ORG_ID)),
        withPostgres(OutboxEventWriterLive, pg.adminPostgresClient, ORG_ID),
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

    const { rows } = await Effect.runPromise(rowRepo.list({ datasetId: DATASET_ID }))
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

    const dataset = await Effect.runPromise(datasetRepo.findById(result.datasetId))
    expect(dataset.name).toBe("from-traces-dataset")

    const { rows } = await Effect.runPromise(rowRepo.list({ datasetId: result.datasetId }))
    expect(rows.length).toBe(traceIds.length)
    for (const row of rows) {
      expect(row.input).toBeDefined()
      expect(row.output).toBeDefined()
    }
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

    await expect(Effect.runPromise(capturingDatasetRepo.findById(id))).rejects.toBeInstanceOf(DatasetNotFoundError)
  })
})
