import type { Dataset, DatasetRow } from "@domain/datasets"
import { DatasetRepository, createDataset, insertRows, listDatasets, listRows } from "@domain/datasets"
import { DatasetId, DatasetVersionId, OrganizationId, ProjectId, putInDisk } from "@domain/shared"
import { DatasetRowRepositoryLive } from "@platform/db-clickhouse"
import { DatasetRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import Papa from "papaparse"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getStorageDisk } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

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
  readonly input: Record<string, JsonValue>
  readonly output: Record<string, JsonValue>
  readonly metadata: Record<string, JsonValue>
  readonly createdAt: string
  readonly version: number
}

export interface ColumnMapping {
  readonly input: string[]
  readonly output: string[]
  readonly metadata: string[]
}

export interface CsvTransformOptions {
  readonly flattenSingleColumn: boolean
  readonly autoParseJson: boolean
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
  input: r.input as Record<string, JsonValue>,
  output: r.output as Record<string, JsonValue>,
  metadata: r.metadata as Record<string, JsonValue>,
  createdAt: r.createdAt.toISOString(),
  version: r.version,
})

/**
 * Apply column mapping and transforms to a single CSV row.
 * Shared between client-side preview and server-side processing.
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
  options: CsvTransformOptions,
): { input: Record<string, unknown>; output: Record<string, unknown>; metadata: Record<string, unknown> } {
  const pick = (columns: string[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const col of columns) {
      if (!(col in row)) continue
      const raw = row[col] as string
      result[col] = options.autoParseJson ? tryParseJson(raw) : raw
    }

    const firstCol = columns[0]
    if (options.flattenSingleColumn && columns.length === 1 && firstCol && firstCol in result) {
      return { value: result[firstCol] }
    }

    return result
  }

  return {
    input: pick(mapping.input),
    output: pick(mapping.output),
    metadata: pick(mapping.metadata),
  }
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "") return value
  if (trimmed === "null") return null
  if (trimmed === "true") return true
  if (trimmed === "false") return false

  const asNumber = Number(trimmed)
  if (trimmed !== "" && !Number.isNaN(asNumber)) return asNumber

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

// Helper to create the combined layer with both repositories
const createDatasetLayers = (organizationId: string) => {
  const client = getPostgresClient()
  const chClient = getClickhouseClient()

  return Layer.merge(DatasetRepositoryLive, DatasetRowRepositoryLive(chClient)).pipe(
    Layer.provide(SqlClientLive(client, OrganizationId(organizationId))),
  )
}

export const listDatasetsQuery = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<{ datasets: DatasetRecord[]; total: number }> => {
    const { organizationId } = await requireSession()

    const result = await Effect.runPromise(
      listDatasets({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
      }).pipe(Effect.provide(createDatasetLayers(organizationId))),
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

    const result = await Effect.runPromise(
      listRows({
        organizationId: OrganizationId(organizationId),
        datasetId: DatasetId(data.datasetId),
        ...(data.versionId ? { versionId: DatasetVersionId(data.versionId) } : {}),
        ...(data.search ? { search: data.search } : {}),
        limit: data.limit,
        offset: data.offset,
      }).pipe(Effect.provide(createDatasetLayers(organizationId))),
    )

    return { rows: result.rows.map(toRowRecord), total: result.total }
  })

export const createDatasetMutation = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ projectId: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }): Promise<DatasetRecord> => {
    const { organizationId } = await requireSession()

    const dataset = await Effect.runPromise(
      createDataset({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
        name: data.name,
      }).pipe(Effect.provide(createDatasetLayers(organizationId))),
    )

    return toDatasetRecord(dataset)
  })

export const saveDatasetCsv = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected FormData")
    return input
  })
  .handler(async ({ data: formData }): Promise<{ version: number; rowCount: number }> => {
    const { organizationId } = await requireSession()

    const file = formData.get("file")
    const datasetId = formData.get("datasetId")
    const projectId = formData.get("projectId")
    const mappingRaw = formData.get("mapping")
    const optionsRaw = formData.get("options")

    if (!(file instanceof File)) throw new Error("No file provided")
    if (typeof datasetId !== "string" || !datasetId) throw new Error("No datasetId provided")
    if (typeof projectId !== "string" || !projectId) throw new Error("No projectId provided")
    if (typeof mappingRaw !== "string") throw new Error("No mapping provided")
    if (typeof optionsRaw !== "string") throw new Error("No options provided")

    const mapping: ColumnMapping = JSON.parse(mappingRaw)
    const options: CsvTransformOptions = JSON.parse(optionsRaw)

    const content = await file.text()

    const fileKey = await Effect.runPromise(
      putInDisk(getStorageDisk(), {
        namespace: "datasets",
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        content,
      }),
    )

    // Update file key using DatasetRepository directly
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.updateFileKey({ id: DatasetId(datasetId), fileKey })
      }).pipe(Effect.provide(createDatasetLayers(organizationId))),
    )

    const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true })
    const mappedRows = parsed.data.map((row) => applyMapping(row, mapping, options))

    if (mappedRows.length === 0) {
      return { version: 0, rowCount: 0 }
    }

    const result = await Effect.runPromise(
      insertRows({
        organizationId: OrganizationId(organizationId),
        datasetId: DatasetId(datasetId),
        rows: mappedRows,
        source: "csv",
      }).pipe(Effect.provide(createDatasetLayers(organizationId))),
    )

    return { version: result.version, rowCount: mappedRows.length }
  })
