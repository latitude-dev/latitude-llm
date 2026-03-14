import {
  DatasetRepository,
  DatasetRowRepository,
  type DatasetRowRepositoryShape,
  RowNotFoundError,
  updateRow,
} from "@domain/datasets"
import { DatasetId, DatasetRowId, OrganizationId, ProjectId } from "@domain/shared"
import { DatasetRepositoryLive, postgresSchema, withPostgres } from "@platform/db-postgres"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { DatasetRowRepositoryLive } from "../repositories/dataset-row-repository.ts"
import { withClickHouse } from "../with-clickhouse.ts"

const ORG_ID = OrganizationId("org-upd-rows")
const PROJECT_ID = ProjectId("proj-upd-rows")
const DATASET_ID = DatasetId("ds-upd-rows")
const ROW_ID = DatasetRowId("row-upd-1")

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

describe("updateRow", () => {
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
      name: "update-row-test",
      currentVersion: 0,
    })
  })

  const run = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | DatasetRowRepository>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
      ),
    )

  const seedRow = async () => {
    await Effect.runPromise(
      datasetRepo.incrementVersion({
        organizationId: ORG_ID,
        id: DATASET_ID,
        rowsInserted: 1,
        source: "web",
      }),
    )

    await Effect.runPromise(
      rowRepo.insertBatch({
        organizationId: ORG_ID,
        datasetId: DATASET_ID,
        version: 1,
        rows: [{ id: ROW_ID, input: { prompt: "original" }, output: { text: "v1" } }],
      }),
    )
  }

  it("fails with RowNotFoundError for non-existent row", async () => {
    await expect(
      run(
        updateRow({
          organizationId: ORG_ID,
          datasetId: DATASET_ID,
          rowId: DatasetRowId("nonexistent"),
          input: {},
          output: {},
          metadata: {},
        }),
      ),
    ).rejects.toBeInstanceOf(RowNotFoundError)
  })

  it("updates row and increments dataset version", async () => {
    await seedRow()

    const result = await run(
      updateRow({
        organizationId: ORG_ID,
        datasetId: DATASET_ID,
        rowId: ROW_ID,
        input: { prompt: "updated" },
        output: { text: "v2" },
        metadata: { edited: true },
      }),
    )

    expect(result.versionId).toBeDefined()
    expect(result.version).toBeGreaterThan(1)

    const row = await Effect.runPromise(
      rowRepo.findById({ organizationId: ORG_ID, datasetId: DATASET_ID, rowId: ROW_ID }),
    )
    expect(row.input).toEqual({ prompt: "updated" })
    expect(row.output).toEqual({ text: "v2" })
  })

  it("returns new versionId and version", async () => {
    await seedRow()

    const result = await run(
      updateRow({
        organizationId: ORG_ID,
        datasetId: DATASET_ID,
        rowId: ROW_ID,
        input: { prompt: "v3" },
        output: { text: "v3" },
        metadata: {},
      }),
    )

    expect(result.versionId).toBeTruthy()
    expect(typeof result.version).toBe("number")
  })
})
