import type { Dataset, DatasetRow } from "@domain/datasets"
import {
  addTracesToDataset,
  buildDatasetCsvExport,
  countRows,
  createDataset,
  createDatasetFromTraces,
  DATASET_DOWNLOAD_DIRECT_THRESHOLD,
  DATASET_LIST_SORT_COLUMNS,
  DatasetRepository,
  type DeleteRowsSelection,
  deleteDataset,
  deleteRows,
  getRowDetail,
  insertRows,
  listDatasets,
  listRows,
  parseDatasetCsv,
  type TraceSelection,
  updateDatasetDetails,
  updateRow,
} from "@domain/datasets"
import type { QueueMessage } from "@domain/queue"
import {
  DatasetId,
  DatasetRowId,
  DatasetVersionId,
  isValidId,
  OrganizationId,
  ProjectId,
  putInDisk,
  sortDirectionSchema,
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

const rowSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("selected"), rowIds: z.array(z.string()).min(1) }),
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("allExcept"), rowIds: z.array(z.string()) }),
])

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

const datasetListCursorSchema = z.object({
  sortValue: z.string(),
  id: z.string(),
})

interface DatasetListResult {
  readonly datasets: readonly DatasetRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: { readonly sortValue: string; readonly id: string }
}

export const listDatasetsByProject = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(
    z
      .object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
        cursor: datasetListCursorSchema.optional(),
        sortBy: z.enum(DATASET_LIST_SORT_COLUMNS).optional(),
        sortDirection: sortDirectionSchema.optional(),
      })
      .refine(
        (data) => {
          if (!data.cursor) return true
          const sortBy = data.sortBy ?? "updatedAt"
          if (sortBy === "updatedAt") {
            const date = new Date(data.cursor.sortValue)
            return !Number.isNaN(date.getTime()) && date.toISOString() === data.cursor.sortValue
          }
          return true
        },
        {
          message: "cursor.sortValue must be a valid ISO date string when sortBy is 'updatedAt'",
          path: ["cursor", "sortValue"],
        },
      ),
  )
  .handler(async ({ data }): Promise<DatasetListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const page = await Effect.runPromise(
      listDatasets({
        projectId: ProjectId(data.projectId),
        options: {
          limit: data.limit ?? 50,
          ...(data.cursor ? { cursor: data.cursor } : {}),
          ...(data.sortBy ? { sortBy: data.sortBy } : {}),
          ...(data.sortDirection ? { sortDirection: data.sortDirection } : {}),
        },
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    const datasets = page.datasets.map(toDatasetRecord)
    if (!page.nextCursor) {
      return { datasets, hasMore: page.hasMore }
    }
    return { datasets, hasMore: page.hasMore, nextCursor: page.nextCursor }
  })

export const getDatasetQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<DatasetRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        const dataset = yield* repo.findById(DatasetId(data.datasetId))
        return toDatasetRecord(dataset)
      }).pipe(
        Effect.catchTag("DatasetNotFoundError", () => Effect.succeed(null)),
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
      ),
    )
  })

const listRowsCursorSchema = z.object({
  createdAt: z.string(),
  rowId: z.string(),
})

export const DATASET_ROW_SORT_COLUMNS = ["createdAt"] as const

export const listRowsQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      versionId: z.string().optional(),
      search: z.string().optional(),
      sortBy: z.enum(DATASET_ROW_SORT_COLUMNS).optional(),
      sortDirection: sortDirectionSchema.optional(),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().default(0),
      cursor: listRowsCursorSchema.optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      rows: DatasetRowRecord[]
      total?: number
      nextCursor?: { createdAt: string; rowId: string }
    }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)

      const sortBy = data.sortBy ?? "createdAt"
      const sortDirection = data.sortDirection ?? "desc"
      const sortDirectionForRows = sortBy === "createdAt" ? sortDirection : "desc"

      const result = await Effect.runPromise(
        listRows({
          datasetId: DatasetId(data.datasetId),
          ...(data.versionId ? { versionId: DatasetVersionId(data.versionId) } : {}),
          ...(data.search ? { search: data.search } : {}),
          sortDirection: sortDirectionForRows,
          limit: data.limit,
          ...(data.cursor
            ? { cursor: { createdAt: data.cursor.createdAt, rowId: DatasetRowId(data.cursor.rowId) } }
            : { offset: data.offset }),
        }).pipe(
          withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
          withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
        ),
      )

      return {
        rows: result.rows.map(toRowRecord),
        ...(result.total !== undefined ? { total: result.total } : {}),
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      }
    },
  )

export const getRowQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ datasetId: z.string(), rowId: z.string(), versionId: z.string().optional() }))
  .handler(async ({ data }): Promise<DatasetRowRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    return Effect.runPromise(
      getRowDetail({
        datasetId: DatasetId(data.datasetId),
        rowId: DatasetRowId(data.rowId),
        ...(data.versionId ? { versionId: DatasetVersionId(data.versionId) } : {}),
      }).pipe(
        Effect.map(toRowRecord),
        Effect.catchTag("RowNotFoundError", () => Effect.succeed(null)),
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )
  })

export const updateDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<DatasetRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const dataset = await Effect.runPromise(
      updateDatasetDetails({
        datasetId: DatasetId(data.datasetId),
        name: data.name,
        description: data.description ?? null,
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    return toDatasetRecord(dataset)
  })

export const deleteDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ datasetId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    await Effect.runPromise(
      deleteDataset({
        datasetId: DatasetId(data.datasetId),
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )
  })

type DatasetDownloadResult = { type: "direct"; csv: string; filename: string } | { type: "enqueued" }

export const getDatasetDownload = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      selection: rowSelectionSchema,
    }),
  )
  .handler(async ({ data }): Promise<DatasetDownloadResult> => {
    const session = await ensureSession()
    const email = session?.user?.email
    const organizationId = getSessionOrganizationId(session)

    if (!organizationId || !email) {
      throw new UnauthorizedError({ message: "Unauthorized" })
    }

    const orgId = OrganizationId(organizationId)
    const datasetId = DatasetId(data.datasetId)
    const dataset = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.findById(datasetId)
      }).pipe(withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId)),
    )

    const total = await Effect.runPromise(
      countRows({ datasetId }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    const { selection } = data
    const effectiveCount =
      selection.mode === "all"
        ? total
        : selection.mode === "allExcept"
          ? Math.max(0, total - selection.rowIds.length)
          : selection.rowIds.length

    if (effectiveCount > DATASET_DOWNLOAD_DIRECT_THRESHOLD) {
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
      listRows({ datasetId, limit: total, offset: 0 }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    const rows =
      selection.mode === "all"
        ? result.rows
        : (() => {
            const ids = new Set(selection.rowIds.map(DatasetRowId))
            return selection.mode === "allExcept"
              ? result.rows.filter((r) => !ids.has(r.rowId))
              : result.rows.filter((r) => ids.has(r.rowId))
          })()

    const { csv, filename } = buildDatasetCsvExport(dataset.name, rows)
    return { type: "direct", csv, filename }
  })

export const createDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      id: z
        .string()
        .optional()
        .refine((value) => value === undefined || isValidId(value), {
          message: "Invalid dataset id",
        }),
      projectId: z.string(),
      name: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<DatasetRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const dataset = await Effect.runPromise(
      createDataset({
        ...(data.id ? { id: DatasetId(data.id) } : {}),
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

export const insertDatasetRowMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      datasetId: z.string(),
      input: z.string(),
      output: z.string(),
      metadata: z.string(),
    }),
  )
  .handler(
    async ({ data }): Promise<{ readonly versionId: string; readonly version: number; readonly rowId: string }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)

      const result = await Effect.runPromise(
        insertRows({
          datasetId: DatasetId(data.datasetId),
          rows: [{ input: data.input, output: data.output, metadata: data.metadata }],
          source: "web",
        }).pipe(
          withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
          withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
        ),
      )

      const rowId = result.rowIds[0]
      if (rowId === undefined) {
        throw new Error("insertRows returned no row id")
      }

      return {
        versionId: result.versionId as string,
        version: result.version,
        rowId: rowId as string,
      }
    },
  )

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
      selection: rowSelectionSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ versionId: string; version: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const selection: DeleteRowsSelection =
      data.selection.mode === "all"
        ? { mode: "all" }
        : { mode: data.selection.mode, rowIds: data.selection.rowIds.map(DatasetRowId) }

    const result = await Effect.runPromise(
      deleteRows({
        datasetId: DatasetId(data.datasetId),
        selection,
      }).pipe(
        withPostgres(DatasetRepositoryLive, getPostgresClient(), orgId),
        withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), orgId),
      ),
    )

    return { versionId: result.versionId as string, version: result.version }
  })

function toTraceSelection(sel: z.infer<typeof rowSelectionSchema>): TraceSelection {
  if (sel.mode === "all") return { mode: "all" }
  return { mode: sel.mode, traceIds: sel.rowIds.map(TraceId) }
}

export const addTracesToDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      projectId: z.string(),
      datasetId: z.string(),
      selection: rowSelectionSchema,
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
        selection: toTraceSelection(data.selection),
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
      datasetId: z
        .string()
        .optional()
        .refine((value) => value === undefined || isValidId(value), {
          message: "Invalid dataset id",
        }),
      projectId: z.string(),
      name: z.string().min(1),
      selection: rowSelectionSchema,
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
          ...(data.datasetId ? { datasetId: DatasetId(data.datasetId) } : {}),
          projectId: ProjectId(data.projectId),
          name: data.name,
          selection: toTraceSelection(data.selection),
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
