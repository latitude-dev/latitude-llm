import { ChSqlClient, DatasetId, DatasetRowId, OrganizationId, ProjectId, SqlClient, StorageDisk } from "@domain/shared"
import { createFakeChSqlClient, createFakeStorageDisk } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { DATASET_DOWNLOAD_DIRECT_THRESHOLD } from "../constants.ts"
import type { DatasetRow } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository, type DatasetRowRepositoryShape } from "../ports/dataset-row-repository.ts"
import { createFakeDatasetRepository } from "../testing/fake-dataset-repository.ts"
import { prepareDatasetDownloadUseCase } from "./prepare-dataset-download.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const datasetId = DatasetId("d".repeat(24))

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
  expectedOutput: "",
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
  const signedUrlCalls: Array<{ key: string; expiresIn?: number }> = []
  const { disk, written } = createFakeStorageDisk({
    getSignedUrl: async (key, options) => {
      signedUrlCalls.push({ key, ...(options?.expiresIn !== undefined ? { expiresIn: options.expiresIn } : {}) })
      return `https://download.test/${key}`
    },
  })
  return {
    disk,
    written,
    signedUrlCalls,
    run: <A, E>(
      effect: Effect.Effect<A, E, DatasetRepository | DatasetRowRepository | StorageDisk | SqlClient | ChSqlClient>,
    ) =>
      effect.pipe(
        Effect.provideService(DatasetRepository, datasetRepo),
        Effect.provideService(DatasetRowRepository, rowRepo),
        Effect.provideService(StorageDisk, disk),
        Effect.provideService(SqlClient, inertSqlClient),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
      ),
  }
}

describe("prepareDatasetDownloadUseCase", () => {
  it("uploads the CSV and returns a signed URL for small selections", async () => {
    const rows = [buildRow(1), buildRow(2)]
    const { run, written, signedUrlCalls } = provide({ rowRepo: createRowRepo({ rows }) })

    const result = await Effect.runPromise(
      run(
        prepareDatasetDownloadUseCase({
          datasetId,
          organizationId,
          selection: { mode: "selected", rowIds: rows.map((r) => r.rowId) },
        }),
      ),
    )

    if (result.kind !== "ready") throw new Error(`expected "ready", got "${result.kind}"`)
    expect(result.filename).toBe("My_Dataset.csv")
    expect(result.rowCount).toBe(2)
    expect(result.downloadUrl).toMatch(/^https:\/\/download\.test\//)
    expect(signedUrlCalls).toHaveLength(1)
    expect(signedUrlCalls[0]?.expiresIn).toBe(60 * 60)

    expect(written).toHaveLength(1)
    const uploaded = written[0]?.contents
    expect(uploaded).toBeDefined()
    const csv = typeof uploaded === "string" ? uploaded : new TextDecoder().decode(uploaded ?? new Uint8Array())
    expect(csv).toContain("input 1")
    expect(csv).toContain("input 2")
  })

  it("returns tooLarge for selected exports above the threshold without touching storage", async () => {
    const selectedIds = Array.from({ length: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1 }, (_, i) =>
      DatasetRowId(`r${i}`.padEnd(24, "0")),
    )
    const { run, written, signedUrlCalls } = provide({ rowRepo: createRowRepo() })

    const result = await Effect.runPromise(
      run(
        prepareDatasetDownloadUseCase({
          datasetId,
          organizationId,
          selection: { mode: "selected", rowIds: selectedIds },
        }),
      ),
    )

    expect(result).toEqual({
      kind: "tooLarge",
      rowCount: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1,
      threshold: DATASET_DOWNLOAD_DIRECT_THRESHOLD,
    })
    expect(written).toHaveLength(0)
    expect(signedUrlCalls).toHaveLength(0)
  })

  it("returns tooLarge for mode: all when the total row count exceeds the threshold", async () => {
    const { run, written } = provide({
      rowRepo: createRowRepo({ countOverride: DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1 }),
    })

    const result = await Effect.runPromise(
      run(
        prepareDatasetDownloadUseCase({
          datasetId,
          organizationId,
          selection: { mode: "all" },
        }),
      ),
    )

    expect(result.kind).toBe("tooLarge")
    expect(written).toHaveLength(0)
  })

  it("returns ready for mode: allExcept once excluded rows bring the count below the threshold", async () => {
    const rows = [buildRow(1), buildRow(2), buildRow(3)]
    const { run } = provide({ rowRepo: createRowRepo({ rows }) })

    const result = await Effect.runPromise(
      run(
        prepareDatasetDownloadUseCase({
          datasetId,
          organizationId,
          selection: { mode: "allExcept", rowIds: [rows[0]?.rowId ?? DatasetRowId("x".padEnd(24, "0"))] },
        }),
      ),
    )

    if (result.kind !== "ready") throw new Error(`expected "ready", got "${result.kind}"`)
    expect(result.rowCount).toBe(2)
  })
})
