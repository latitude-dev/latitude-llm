import {
  DatasetRepository,
  DatasetRowRepository,
  type DatasetRowRepositoryShape,
  deleteRows,
  RowNotFoundError,
} from "@domain/datasets"
import { DatasetId, DatasetRowId, OrganizationId, ProjectId } from "@domain/shared"
import { DatasetRepositoryLive, postgresSchema, withPostgres } from "@platform/db-postgres"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { DatasetRowRepositoryLive } from "../repositories/dataset-row-repository.ts"
import { withClickHouse } from "../with-clickhouse.ts"

const ORG_ID = OrganizationId("org-del-rows")
const PROJECT_ID = ProjectId("proj-del-rows")
const DATASET_ID = DatasetId("ds-del-rows")
const ROW_1 = DatasetRowId("row-del-1")
const ROW_2 = DatasetRowId("row-del-2")

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

describe("deleteRows", () => {
  let datasetRepo: (typeof DatasetRepository)["Service"]
  let rowRepo: DatasetRowRepositoryShape

  beforeAll(async () => {
    datasetRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRepository
      }).pipe(withPostgres(DatasetRepositoryLive, pg.adminPostgresClient, ORG_ID)),
    )

    rowRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRowRepository
      }).pipe(withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID)),
    )

    await pg.db.insert(postgresSchema.datasets).values({
      id: DATASET_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "delete-rows-test",
      currentVersion: 0,
    })
  })

  const seedRows = async (rowIds: DatasetRowId[]) => {
    await Effect.runPromise(
      datasetRepo.incrementVersion({
        organizationId: ORG_ID,
        id: DATASET_ID,
        rowsInserted: rowIds.length,
        source: "web",
      }),
    )

    await Effect.runPromise(
      rowRepo.insertBatch({
        organizationId: ORG_ID,
        datasetId: DATASET_ID,
        version: 1,
        rows: rowIds.map((id) => ({ id, input: { prompt: "test" } })),
      }),
    )
  }

  const run = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | DatasetRowRepository>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
      ),
    )

  it("returns early without side effects for empty rowIds", async () => {
    const result = await run(deleteRows({ organizationId: ORG_ID, datasetId: DATASET_ID, rowIds: [] }))

    expect(result).toEqual({ versionId: null, version: 0 })
  })

  it("validates all rows exist before deleting", async () => {
    await seedRows([ROW_1])

    await expect(
      run(deleteRows({ organizationId: ORG_ID, datasetId: DATASET_ID, rowIds: [ROW_1, DatasetRowId("missing")] })),
    ).rejects.toBeInstanceOf(RowNotFoundError)

    const { rows } = await Effect.runPromise(rowRepo.list({ organizationId: ORG_ID, datasetId: DATASET_ID }))
    expect(rows.some((r) => r.rowId === ROW_1)).toBe(true)
  })

  it("deletes rows and increments dataset version", async () => {
    await seedRows([ROW_1, ROW_2])

    const result = await run(deleteRows({ organizationId: ORG_ID, datasetId: DATASET_ID, rowIds: [ROW_1, ROW_2] }))

    expect(result.versionId).toBeDefined()
    expect(result.version).toBeGreaterThan(0)

    const { rows } = await Effect.runPromise(rowRepo.list({ organizationId: ORG_ID, datasetId: DATASET_ID }))
    const deletedRowIds = rows.map((r) => r.rowId)
    expect(deletedRowIds).not.toContain(ROW_1)
    expect(deletedRowIds).not.toContain(ROW_2)
  })
})
