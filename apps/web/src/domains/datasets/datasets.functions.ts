import type { Dataset, DatasetRow } from "@domain/datasets"
import {
  addTracesToDataset,
  buildDatasetCsvExport,
  countRows,
  createDataset,
  createDatasetFromTraces,
  DATASET_DOWNLOAD_DIRECT_THRESHOLD,
  DatasetRepository,
  deleteRows,
  insertRows,
  listDatasets,
  listRows,
  parseDatasetCsv,
  renameDataset,
  updateRow,
} from "@domain/datasets"
import type { QueueMessage } from "@domain/queue"
import {
  DatasetId,
  DatasetRowId,
  DatasetVersionId,
  OrganizationId,
  ProjectId,
  putInDisk,
  TraceId,
  UnauthorizedError,
} from "@domain/shared"
import { DatasetRowRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { DatasetRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId, requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getStorageDisk } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"
import { applyMapping } from "./column-mapping.ts"

const saveDatasetCsvDataSchema = z.object({
  datasetId: z.string().min(1),
  projectId: z.string().min(1),
  mapping: z.object({
    input: z.array(z.string()),
    output: z.array(z.string()),
    metadata: z.array(z.string()),
  }),
  options: z
    .object({
      flattenSingleColumn: z.boolean(),
      autoParseJson: z.boolean(),
    })
    .default({ flattenSingleColumn: false, autoParseJson: false }),
})

type SaveDatasetCsvData = z.infer<typeof saveDatasetCsvDataSchema>

export interface DatasetRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly name: string
  readonly description: string | null
  readonly fileKey: string | null
  readonly currentVersion: number
  readonly latestVersionId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface DatasetRowRecord {
  readonly rowId: string
  readonly datasetId: string
  readonly input: string | Record<string, JsonValue>
  readonly output: string | Record<string, JsonValue>
  readonly metadata: string | Record<string, JsonValue>
  readonly createdAt: string
  readonly version: number
}

const toDatasetRecord = (d: Dataset): DatasetRecord => ({
  id: d.id,
  organizationId: d.organizationId,
  projectId: d.projectId,
  name: d.name,
  description: d.description,
  fileKey: d.fileKey,
  currentVersion: d.currentVersion,
  latestVersionId: d.latestVersionId,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
})

const toRowRecord = (r: DatasetRow): DatasetRowRecord => ({
  rowId: r.rowId,
  datasetId: r.datasetId,
  input: typeof r.input === "string" ? r.input : (r.input as Record<string, JsonValue>),
  output: typeof r.output === "string" ? r.output : (r.output as Record<string, JsonValue>),
  metadata: typeof r.metadata === "string" ? r.metadata : (r.metadata as Record<string, JsonValue>),
  createdAt: r.createdAt.toISOString(),
  version: r.version,
})

export const listDatasetsQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<{ datasets: DatasetRecord[]; total: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      listDatasets({
        projectId: ProjectId(data.projectId),
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return {
      datasets: result.datasets.map(toDatasetRecord),
      total: result.total,
    }
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
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      listRows({
        datasetId: DatasetId(data.datasetId),
        ...(data.versionId ? { versionId: DatasetVersionId(data.versionId) } : {}),
        ...(data.search ? { search: data.search } : {}),
        limit: data.limit,
        offset: data.offset,
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return { rows: result.rows.map(toRowRecord), total: result.total }
  })

export const renameDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ datasetId: z.string(), name: z.string() }))
  .handler(async ({ data }): Promise<DatasetRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const dataset = await Effect.runPromise(
      renameDataset({
        datasetId: DatasetId(data.datasetId),
        name: data.name,
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    return toDatasetRecord(dataset)
  })

type DatasetDownloadResult = { type: "direct"; csv: string; filename: string } | { type: "enqueued" }

export const getDatasetDownload = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<DatasetDownloadResult> => {
    const session = await ensureSession()
    const email = session?.user?.email
    const organizationId = getSessionOrganizationId(session)

    if (!organizationId || !email) {
      throw new UnauthorizedError({ message: "Unauthorized" })
    }

    const orgId = OrganizationId(organizationId)
    const dataset = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.findById(DatasetId(data.datasetId))
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    const total = await Effect.runPromise(
      countRows({ datasetId: DatasetId(data.datasetId) }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    if (total > DATASET_DOWNLOAD_DIRECT_THRESHOLD) {
      const publisher = await getQueuePublisher()

      const payload = {
        datasetId: data.datasetId,
        organizationId,
        projectId: dataset.projectId,
        recipientEmail: email,
      }
      const message: QueueMessage = {
        body: new TextEncoder().encode(JSON.stringify(payload)),
        key: orgId,
        headers: new Map([
          ["organization-id", payload.organizationId],
          ["project-id", payload.projectId],
        ]),
      }
      await Effect.runPromise(publisher.publish("dataset-export", message))
      return { type: "enqueued" }
    }

    const result = await Effect.runPromise(
      listRows({
        datasetId: DatasetId(data.datasetId),
        limit: total,
        offset: 0,
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )
    const { csv, filename } = buildDatasetCsvExport(dataset.name, result.rows)
    return { type: "direct", csv, filename }
  })

export const createDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string(), name: z.string() }))
  .handler(async ({ data }): Promise<DatasetRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const dataset = await Effect.runPromise(
      createDataset({
        projectId: ProjectId(data.projectId),
        name: data.name,
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return toDatasetRecord(dataset)
  })

export const saveDatasetCsv = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator((input: unknown): { file: File; data: SaveDatasetCsvData } => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData")
    const file = input.get("file")
    const dataRaw = input.get("data")
    if (!(file instanceof File)) throw new Error("No file provided")
    if (typeof dataRaw !== "string") throw new Error("No data provided")
    const data = saveDatasetCsvDataSchema.parse(JSON.parse(dataRaw))
    return { file, data }
  })
  .handler(async ({ data: { file, data } }): Promise<{ version: number; rowCount: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const { datasetId, projectId, mapping, options } = data

    const content = await file.text()

    const fileKey = await Effect.runPromise(
      putInDisk(getStorageDisk(), {
        namespace: "datasets",
        organizationId: orgId,
        projectId: ProjectId(projectId),
        content,
      }),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.updateFileKey({
          id: DatasetId(datasetId),
          fileKey,
        })
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    const { rows } = parseDatasetCsv(content)
    const mappedRows = rows.map((row) => applyMapping(row, mapping, options))

    if (mappedRows.length === 0) {
      return { version: 0, rowCount: 0 }
    }

    const result = await Effect.runPromise(
      insertRows({
        datasetId: DatasetId(datasetId),
        rows: mappedRows,
        source: "csv",
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return { version: result.version, rowCount: mappedRows.length }
  })

export const updateRowMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      rowId: z.string(),
      input: z.string(),
      output: z.string(),
      metadata: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      updateRow({
        datasetId: DatasetId(data.datasetId),
        rowId: DatasetRowId(data.rowId),
        input: data.input,
        output: data.output,
        metadata: data.metadata,
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return { versionId: result.versionId, version: result.version }
  })

export const deleteRowsMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      rowIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ versionId: string; version: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const result = await Effect.runPromise(
      deleteRows({
        datasetId: DatasetId(data.datasetId),
        rowIds: data.rowIds.map((id) => DatasetRowId(id)),
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return { versionId: result.versionId as string, version: result.version }
  })

export const addTracesToDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      projectId: z.string(),
      datasetId: z.string(),
      traceIds: z.array(z.string()).min(1).max(1000),
    }),
  )
  .handler(async ({ data }): Promise<{ versionId: string; version: number; rowCount: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const chClient = getClickhouseClient()

    const result = await Effect.runPromise(
      addTracesToDataset({
        projectId: ProjectId(data.projectId),
        datasetId: DatasetId(data.datasetId),
        traceIds: data.traceIds.map((id) => TraceId(id)),
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, chClient, orgId),
        withClickHouse(TraceRepositoryLive, chClient, orgId),
      ),
    )

    return {
      versionId: result.versionId as string,
      version: result.version,
      rowCount: result.rowIds.length,
    }
  })

export const createDatasetFromTracesMutation = createServerFn({
  method: "POST",
})
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      projectId: z.string(),
      name: z.string().min(1),
      traceIds: z.array(z.string()).min(1).max(1000),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      datasetId: string
      versionId: string
      version: number
      rowCount: number
    }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)
      const pgClient = getPostgresClient()
      const chClient = getClickhouseClient()

      const result = await Effect.runPromise(
        createDatasetFromTraces({
          projectId: ProjectId(data.projectId),
          name: data.name,
          traceIds: data.traceIds.map((id) => TraceId(id)),
        }).pipe(
          withPostgres(DatasetRepositoryLive, pgClient, orgId),
          withClickHouse(DatasetRowRepositoryLive, chClient, orgId),
          withClickHouse(TraceRepositoryLive, chClient, orgId),
        ),
      )

      return {
        datasetId: result.datasetId as string,
        versionId: result.versionId as string,
        version: result.version,
        rowCount: result.rowIds.length,
      }
    },
  )
