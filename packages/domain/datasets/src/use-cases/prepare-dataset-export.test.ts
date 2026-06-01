import { ChSqlClient, DatasetId, DatasetRowId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { DATASET_DOWNLOAD_DIRECT_THRESHOLD } from "../constants.ts"
import type { DatasetRow } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository, type DatasetRowRepositoryShape } from "../ports/dataset-row-repository.ts"
import { createFakeDatasetRepository } from "../testing/fake-dataset-repository.ts"
import { prepareDatasetExportUseCase } from "./prepare-dataset-export.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const datasetId = DatasetId("d".repeat(24))
const recipientEmail = "owner@acme.com"

const inertSqlClient = {
  organizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die("SqlClient.query should not be called"),
}

const buildRow = (i: number): DatasetRow => ({
  rowId: DatasetRowId(`r${i}`.padEnd(24, "0")),
  datasetId,
  input: `input ${i}`,
  output: `output ${i}`,
  metadata: "",
  createdAt: new Date(0),
  version: 1,
})

const createRowRepo = (
  args: { readonly rows?: readonly DatasetRow[]; readonly countOverride?: number } = {},
): DatasetRowRepositoryShape => ({
  findExistingTraceIds: () => Effect.die("findExistingTraceIds should not be called"),
  insertBatch: () => Effect.die("insertBatch should not be called"),
  list: () => Effect.die("list should not be called"),
  findById: () => Effect.die("findById should not be called"),
  updateRow: () => Effect.die("updateRow should not be called"),
  deleteBatch: () => Effect.die("deleteBatch should not be called"),
  deleteAll: () => Effect.die("deleteAll should not be called"),
  count: () => Effect.succeed(args.countOverride ?? args.rows?.length ?? 0),
  listPage: ({ limit, offset }) => Effect.succeed(args.rows ? args.rows.slice(offset, offset + limit) : []),
})

const seedDataset = () =>
  createFakeDatasetRepository(
    [
      {
        id: datasetId,
        organizationId,
        projectId,
        slug: "ds",
        name: "My Dataset",
        description: null,
        fileKey: null,
        currentVersion: 1,
        latestVersionId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    undefined,
    { organizationId },
  )

interface ProvideOptions {
  readonly rowRepo: DatasetRowRepositoryShape
}

const provide = ({ rowRepo }: ProvideOptions) => {
  const { repository: datasetRepo } = seedDataset()
  return {
    run: <A, E>(effect: Effect.Effect<A, E, DatasetRepository | DatasetRowRepository | SqlClient | ChSqlClient>) =>
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
        Effect.provideService(SqlClient, inertSqlClient),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
      ),
  }
}

describe("prepareDatasetExportUseCase", () => {
  describe("mode: selected", () => {
    it("returns the CSV inline when rowIds.length is at or below the threshold", async () => {
      const rows = [buildRow(1), buildRow(2)]
      const selectedIds = rows.map((r) => r.rowId)
      const { run } = provide({ rowRepo: createRowRepo({ rows }) })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "selected", rowIds: selectedIds },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "direct") throw new Error(`expected "direct", got "${result.kind}"`)
      expect(result.filename).toBe("My_Dataset.csv")
      expect(result.exportName).toBe("My Dataset")
      expect(result.csv.startsWith("input,output,metadata")).toBe(true)
      expect(result.csv).toContain("input 1")
      expect(result.csv).toContain("input 2")
    })

    it("returns the needsEnqueue payload when rowIds.length exceeds the threshold", async () => {
      const selectedIds = Array.from({ length: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1 }, (_, i) =>
        DatasetRowId(`r${i}`.padEnd(24, "0")),
      )
      const { run } = provide({ rowRepo: createRowRepo() })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "selected", rowIds: selectedIds },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "needsEnqueue") throw new Error(`expected "needsEnqueue", got "${result.kind}"`)
      expect(result.payload).toMatchObject({
        kind: "dataset",
        datasetId,
        organizationId,
        projectId,
        recipientEmail,
        selection: { mode: "selected", rowIds: selectedIds },
      })
    })

    it("returns the needsEnqueue payload when the dataset itself is huge even if the selection is tiny", async () => {
      // Guards against the synchronous full-table scan inside
      // buildDatasetExportUseCase: any non-"all" selection paginates the
      // whole dataset before filtering in memory, so a tiny `selected`
      // export from a giant dataset must still route to the async path.
      const tinySelection = [DatasetRowId("a".padEnd(24, "0"))]
      const { run } = provide({
        rowRepo: createRowRepo({ countOverride: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1 }),
      })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "selected", rowIds: tinySelection },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      expect(result.kind).toBe("needsEnqueue")
    })
  })

  describe("mode: all", () => {
    it("returns the CSV inline when the total row count is at or below the threshold", async () => {
      const rows = [buildRow(1), buildRow(2), buildRow(3)]
      const { run } = provide({ rowRepo: createRowRepo({ rows }) })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "all" },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "direct") throw new Error(`expected "direct", got "${result.kind}"`)
      expect(result.csv).toContain("input 1")
      expect(result.csv).toContain("input 3")
    })

    it("returns the needsEnqueue payload when the total row count exceeds the threshold", async () => {
      const { run } = provide({
        rowRepo: createRowRepo({ countOverride: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1 }),
      })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "all" },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "needsEnqueue") throw new Error(`expected "needsEnqueue", got "${result.kind}"`)
      expect(result.payload).toMatchObject({ kind: "dataset", selection: { mode: "all" } })
    })
  })

  describe("mode: allExcept", () => {
    it("uses total minus excluded to land below the threshold and returns inline CSV", async () => {
      const rows = Array.from({ length: 4 }, (_, i) => buildRow(i + 1))
      const excludedId = rows[0]?.rowId
      if (!excludedId) throw new Error("seed expected at least one row")
      const { run } = provide({ rowRepo: createRowRepo({ rows }) })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "allExcept", rowIds: [excludedId] },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "direct") throw new Error(`expected "direct", got "${result.kind}"`)
      expect(result.csv).not.toContain("input 1")
      expect(result.csv).toContain("input 2")
    })

    it("returns the needsEnqueue payload when total minus excluded still exceeds the threshold", async () => {
      const { run } = provide({
        rowRepo: createRowRepo({ countOverride: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 10 }),
      })

      const result = await Effect.runPromise(
        run(
          prepareDatasetExportUseCase({
            datasetId,
            selection: { mode: "allExcept", rowIds: [DatasetRowId("x".padEnd(24, "0"))] },
            organizationId,
            recipientEmail,
          }),
        ),
      )

      if (result.kind !== "needsEnqueue") throw new Error(`expected "needsEnqueue", got "${result.kind}"`)
      expect(result.payload).toMatchObject({ kind: "dataset", selection: { mode: "allExcept" } })
    })
  })
})
