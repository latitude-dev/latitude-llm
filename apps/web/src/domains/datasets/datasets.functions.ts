import type { Dataset, DatasetRow } from "@domain/datasets"
import { DatasetRepository, DatasetRowRepository, listDatasets, listRows } from "@domain/datasets"
import { DatasetId, DatasetVersionId, OrganizationId, ProjectId } from "@domain/shared"
import { createDatasetRowClickHouseRepository } from "@platform/db-clickhouse"
import { createDatasetPostgresRepository, runCommand } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export interface DatasetRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly name: string
  readonly description: string | null
  readonly currentVersion: number
  readonly latestVersionId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface DatasetRowRecord {
  readonly rowId: string
  readonly datasetId: string
  readonly input: Record<string, JsonValue>
  readonly output: Record<string, JsonValue>
  readonly metadata: Record<string, JsonValue>
  readonly createdAt: string
  readonly version: number
}

const toDatasetRecord = (d: Dataset): DatasetRecord => ({
  id: d.id,
  organizationId: d.organizationId,
  projectId: d.projectId,
  name: d.name,
  description: d.description,
  currentVersion: d.currentVersion,
  latestVersionId: d.latestVersionId,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
})

const toRowRecord = (r: DatasetRow): DatasetRowRecord => ({
  rowId: r.rowId,
  datasetId: r.datasetId,
  input: r.input as Record<string, JsonValue>,
  output: r.output as Record<string, JsonValue>,
  metadata: r.metadata as Record<string, JsonValue>,
  createdAt: r.createdAt.toISOString(),
  version: r.version,
})

export const listDatasetsQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<{ datasets: DatasetRecord[]; total: number }> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const result = await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        listDatasets({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
        }).pipe(Effect.provideService(DatasetRepository, createDatasetPostgresRepository(txDb))),
      ),
    )

    return { datasets: result.datasets.map(toDatasetRecord), total: result.total }
  })

export const listRowsQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      versionId: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().default(0),
    }),
  )
  .handler(async ({ data }): Promise<{ rows: DatasetRowRecord[]; total: number }> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const result = await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        listRows({
          organizationId: OrganizationId(organizationId),
          datasetId: DatasetId(data.datasetId),
          ...(data.versionId ? { versionId: DatasetVersionId(data.versionId) } : {}),
          ...(data.search ? { search: data.search } : {}),
          limit: data.limit,
          offset: data.offset,
        }).pipe(
          Effect.provideService(DatasetRepository, createDatasetPostgresRepository(txDb)),
          Effect.provideService(DatasetRowRepository, createDatasetRowClickHouseRepository(getClickhouseClient())),
        ),
      ),
    )

    return { rows: result.rows.map(toRowRecord), total: result.total }
  })
