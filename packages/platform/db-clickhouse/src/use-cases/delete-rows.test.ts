import {
  DatasetRepository,
  DatasetRowRepository,
  type DatasetRowRepositoryShape,
  deleteRows,
  RowNotFoundError,
} from "@domain/datasets"
import { DatasetId, DatasetRowId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { DatasetRepositoryLive, withPostgres } from "@platform/db-postgres"
import { datasets } from "@platform/db-postgres/schema/datasets"
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
const ROW_3 = DatasetRowId("row-del-3")

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

    await pg.db.insert(datasets).values({
      id: DATASET_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "delete-rows-test",
      currentVersion: 0,
    })
  })

  const seedRows = async (rowIds: DatasetRowId[]) => {
    const version = await Effect.runPromise(
      datasetRepo
        .incrementVersion({
          id: DATASET_ID,
          rowsInserted: rowIds.length,
          source: "web",
        })
        .pipe(Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: ORG_ID }))),
    )

    await Effect.runPromise(
      rowRepo.insertBatch({
        datasetId: DATASET_ID,
        version: version.version,
        rows: rowIds.map((id) => ({ id, input: { prompt: "test" } })),
      }),
    )

    return version
  }

  const run = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | DatasetRowRepository | SqlClient>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
        Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      ),
    )

  const activeRowIds = async () => {
    const { rows } = await Effect.runPromise(rowRepo.list({ datasetId: DATASET_ID }))
    return rows.map((r) => r.rowId)
  }

  describe("mode: selected", () => {
    it("returns early without side effects for empty rowIds", async () => {
      const result = await run(deleteRows({ datasetId: DATASET_ID, selection: { mode: "selected", rowIds: [] } }))
      expect(result).toEqual({ versionId: null, version: 0 })
    })

    it("validates all rows exist before deleting", async () => {
      await seedRows([ROW_1])

      await expect(
        run(
          deleteRows({
            datasetId: DATASET_ID,
            selection: { mode: "selected", rowIds: [ROW_1, DatasetRowId("missing")] },
          }),
        ),
      ).rejects.toBeInstanceOf(RowNotFoundError)

      expect(await activeRowIds()).toContain(ROW_1)
    })

    it("deletes specified rows and increments dataset version", async () => {
      await seedRows([ROW_1, ROW_2])

      const result = await run(
        deleteRows({ datasetId: DATASET_ID, selection: { mode: "selected", rowIds: [ROW_1, ROW_2] } }),
      )

      expect(result.versionId).toBeDefined()
      expect(result.version).toBeGreaterThan(0)

      const ids = await activeRowIds()
      expect(ids).not.toContain(ROW_1)
      expect(ids).not.toContain(ROW_2)
    })
  })

  describe("mode: all", () => {
    it("deletes all rows in the dataset", async () => {
      await seedRows([ROW_1, ROW_2, ROW_3])

      const result = await run(deleteRows({ datasetId: DATASET_ID, selection: { mode: "all" } }))

      expect(result.versionId).toBeDefined()
      expect(result.version).toBeGreaterThan(0)
      expect(result.deletedCount).toBeGreaterThanOrEqual(3)

      const ids = await activeRowIds()
      expect(ids).not.toContain(ROW_1)
      expect(ids).not.toContain(ROW_2)
      expect(ids).not.toContain(ROW_3)
    })

    it("returns deletedCount 0 when dataset is already empty", async () => {
      const result = await run(deleteRows({ datasetId: DATASET_ID, selection: { mode: "all" } }))

      expect(result.versionId).toBeDefined()
      expect(result.deletedCount).toBe(0)
    })
  })

  describe("mode: allExcept", () => {
    it("deletes all rows except excluded ones", async () => {
      await seedRows([ROW_1, ROW_2, ROW_3])

      const result = await run(deleteRows({ datasetId: DATASET_ID, selection: { mode: "allExcept", rowIds: [ROW_2] } }))

      expect(result.versionId).toBeDefined()
      expect(result.version).toBeGreaterThan(0)

      const ids = await activeRowIds()
      expect(ids).not.toContain(ROW_1)
      expect(ids).toContain(ROW_2)
      expect(ids).not.toContain(ROW_3)
    })
  })
})
