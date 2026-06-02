import {
  addTracesToDataset,
  createDataset,
  type DatasetListCursor,
  DatasetRepository,
  deleteDataset,
  deleteRows,
  insertRows,
  listDatasets,
  listRows,
  prepareDatasetDownloadUseCase,
  updateDatasetDetails,
} from "@domain/datasets"
import { exportSelectionSchema } from "@domain/exports"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import {
  BadRequestError,
  DatasetId,
  DatasetRowId,
  OrganizationId,
  ProjectId,
  type SortDirection,
  TraceId,
} from "@domain/shared"
import { resolveTraceIdsFromRef, type TracesRef } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  DatasetRowRepositoryLive,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  DatasetRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { StorageDiskLive } from "@platform/storage-object"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  DATASET_SORT_FIELDS,
  DatasetSchema,
  PaginatedDatasetsSchema,
  toDatasetResponse,
} from "../openapi/entities/dataset.ts"
import { DatasetRowSchema, toDatasetRowResponse } from "../openapi/entities/dataset-row.ts"
import { Paginated, PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  TracesRefSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const datasetsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "datasets",
    "x-fern-sdk-method-name": methodName,
  }) as const

const DatasetSlugParamsSchema = ProjectParamsSchema.extend({
  datasetSlug: z.string().describe("Dataset slug (human-readable identifier within the project)."),
})

const encodeDatasetCursor = (cursor: DatasetListCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

const decodeDatasetCursor = (raw: string): DatasetListCursor | null => {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as { sortValue?: unknown }).sortValue !== "string" ||
      typeof (parsed as { id?: unknown }).id !== "string"
    ) {
      return null
    }
    return parsed as DatasetListCursor
  } catch {
    return null
  }
}

const ListDatasetsQuerySchema = PaginatedQueryParamsSchema.extend({
  sortBy: z.enum(DATASET_SORT_FIELDS).default("updatedAt").describe("Field to sort by. Defaults to `updatedAt`."),
  sortDirection: z.enum(["asc", "desc"]).default("desc").describe("Sort direction. Defaults to `desc`."),
})

const CreateDatasetBody = z
  .object({
    name: z.string().min(1).describe("Human-readable name. Used to derive the slug."),
    description: z.string().optional().describe("Free-form description. Defaults to `null` when omitted or empty."),
  })
  .openapi("CreateDatasetBody")

const UpdateDatasetBody = z
  .object({
    name: z.string().min(1).optional().describe("New human-readable name. Renaming regenerates the slug."),
    description: z
      .string()
      .nullable()
      .optional()
      .describe("New description. Pass `null` to clear; omit to keep the current value."),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: "Provide at least one of `name` or `description`.",
  })
  .openapi("UpdateDatasetBody")

export const datasetsPath = "/projects/:projectSlug/datasets"

const datasetEndpoint = defineApiEndpoint<OrganizationScopedEnv>(datasetsPath)

const listDatasetsEndpoint = datasetEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listDatasets",
    tags: ["Datasets"],
    ...datasetsFernGroup("list"),
    summary: "List project datasets",
    description: "Returns a cursor-paginated page of datasets in the project.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListDatasetsQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedDatasetsSchema, description: "Page of datasets" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let cursor: DatasetListCursor | undefined
        if (query.cursor) {
          const decoded = decodeDatasetCursor(query.cursor)
          if (!decoded) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          cursor = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* listDatasets({
          projectId: ProjectId(project.id as string),
          options: {
            limit: query.limit,
            sortBy: query.sortBy,
            sortDirection: query.sortDirection,
            ...(cursor ? { cursor } : {}),
          },
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.datasets.map(toDatasetResponse),
        nextCursor: page.nextCursor ? encodeDatasetCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
      },
      200,
    )
  },
})

const getDataset = datasetEndpoint({
  route: createRoute({
    method: "get",
    path: "/{datasetSlug}",
    name: "getDataset",
    tags: ["Datasets"],
    ...datasetsFernGroup("get"),
    summary: "Get project dataset",
    description: "Returns one dataset by slug.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: DatasetSchema, description: "Dataset" }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const dataset = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        return yield* datasetRepo.findBySlug({ projectId: ProjectId(project.id as string), slug: datasetSlug })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toDatasetResponse(dataset), 200)
  },
})

const createDatasetEndpoint = datasetEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createDataset",
    tags: ["Datasets"],
    ...datasetsFernGroup("create"),
    summary: "Create dataset",
    description: "Creates an empty dataset in the project. The slug is derived from `name`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateDatasetBody) },
    responses: openApiResponses({ status: 201, schema: DatasetSchema, description: "Created dataset" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id
    const actorUserId = c.var.auth.method === "oauth" ? (c.var.auth.userId as string) : undefined

    const dataset = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* createDataset({
          projectId: ProjectId(project.id as string),
          name: body.name,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(actorUserId !== undefined ? { actorUserId } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toDatasetResponse(dataset), 201)
  },
})

const updateDataset = datasetEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{datasetSlug}",
    name: "updateDataset",
    tags: ["Datasets"],
    ...datasetsFernGroup("update"),
    summary: "Update dataset",
    description:
      "Updates a dataset's `name` and/or `description`. Renaming regenerates the slug — clients should re-read the response or rely on the `id` for stable references.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, body: jsonBody(UpdateDatasetBody) },
    responses: openApiResponses({ status: 200, schema: DatasetSchema, description: "Updated dataset" }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        const current = yield* datasetRepo.findBySlug({
          projectId: ProjectId(project.id as string),
          slug: datasetSlug,
        })

        return yield* updateDatasetDetails({
          datasetId: DatasetId(current.id as string),
          name: body.name ?? current.name,
          description: body.description !== undefined ? body.description : current.description,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(toDatasetResponse(updated), 200)
  },
})

const deleteDatasetEndpoint = datasetEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{datasetSlug}",
    name: "deleteDataset",
    tags: ["Datasets"],
    ...datasetsFernGroup("delete"),
    summary: "Delete dataset",
    description: "Deletes a dataset by slug.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Dataset deleted" }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        const current = yield* datasetRepo.findBySlug({
          projectId: ProjectId(project.id as string),
          slug: datasetSlug,
        })

        yield* deleteDataset({ datasetId: DatasetId(current.id as string) })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

// ─── Rows ────────────────────────────────────────────────────────────────────

const InsertRowCellSchema = z.union([z.string(), z.record(z.string(), z.unknown()), z.number(), z.boolean(), z.null()])

const PaginatedDatasetRowsSchema = Paginated(DatasetRowSchema, "PaginatedDatasetRows")

const encodeRowCursor = (cursor: { readonly createdAt: string; readonly rowId: string }): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

const decodeRowCursor = (raw: string): { readonly createdAt: string; readonly rowId: string } | null => {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
      typeof (parsed as { rowId?: unknown }).rowId !== "string"
    ) {
      return null
    }
    return parsed as { createdAt: string; rowId: string }
  } catch {
    return null
  }
}

const ListRowsQuerySchema = PaginatedQueryParamsSchema.extend({
  search: z.string().min(1).max(500).optional().describe("Free-text search against row cells."),
  sortDirection: z
    .enum(["asc", "desc"])
    .default("desc")
    .describe("Sort direction on `createdAt`. Defaults to `desc` (newest first)."),
})

const InsertRowBodySchema = z
  .object({
    rows: z
      .array(
        z.object({
          id: z
            .string()
            .min(1)
            .max(128)
            .optional()
            .describe("Optional client-supplied row id. Generated when omitted."),
          input: InsertRowCellSchema.describe("Row input cell."),
          output: InsertRowCellSchema.optional().describe("Row output cell."),
          expectedOutput: InsertRowCellSchema.optional().describe(
            "Correct answer for this row. Filled in by curators; usually distinct from `output`.",
          ),
          metadata: InsertRowCellSchema.optional().describe("Row metadata cell."),
        }),
      )
      .min(1)
      .describe("Rows to insert."),
  })
  .openapi("InsertDatasetRowsBody")

const InsertRowsResponseSchema = z
  .object({
    versionId: z.string().describe("New dataset version id."),
    version: z.number().int().nonnegative().describe("New dataset version number."),
    rowIds: z.array(z.string()).describe("Ids of the inserted rows."),
  })
  .openapi("InsertDatasetRowsResponse")

const DeleteRowsBodySchema = z
  .object({
    selection: exportSelectionSchema.describe("Rows to delete."),
  })
  .openapi("DeleteDatasetRowsBody")

const DeleteRowsResponseSchema = z
  .object({
    versionId: z.string().nullable().describe("New dataset version id, or `null` when nothing was deleted."),
    version: z.number().int().nonnegative().describe("New dataset version number."),
    deletedCount: z.number().int().nonnegative().optional().describe("Number of rows removed."),
  })
  .openapi("DeleteDatasetRowsResponse")

const ImportFromTracesBodySchema = z
  .object({
    traces: TracesRefSchema.describe("Which traces to import as rows — either explicit ids or a filter set."),
  })
  .openapi("ImportRowsFromTracesBody")

const ImportFromTracesResponseSchema = z
  .object({
    versionId: z.string().describe("New dataset version id."),
    version: z.number().int().nonnegative().describe("New dataset version number."),
    rowIds: z.array(z.string()).describe("Ids of the inserted rows."),
  })
  .openapi("ImportRowsFromTracesResponse")

const ExportRowsBodySchema = z
  .object({
    selection: exportSelectionSchema.optional().describe('Rows to export. Defaults to `{ mode: "all" }` when omitted.'),
    recipient: z
      .email()
      .optional()
      .describe(
        "Email address to send the download link to when the export is too large for the synchronous path. Must belong to a member of the requesting organization. Ignored when the export fits the synchronous path; required for the async email flow.",
      ),
  })
  .openapi("ExportDatasetRowsBody")

const ExportReadyResponseSchema = z
  .object({
    status: z.literal("ready").describe('Always `"ready"`. The CSV is available at `downloadUrl`.'),
    downloadUrl: z
      .string()
      .describe("Short-lived signed URL pointing to the CSV in object storage. Follow it with a plain HTTP GET."),
    filename: z.string().describe("Suggested filename for the downloaded CSV."),
    expiresAt: z.string().describe("ISO-8601 timestamp at which `downloadUrl` stops working."),
    rowCount: z.number().int().nonnegative().describe("Number of rows included in the export."),
  })
  .openapi("ExportDatasetRowsReadyResponse")

const ExportQueuedResponseSchema = z
  .object({
    status: z.literal("queued").describe('Always `"queued"`. The CSV is emailed to `recipient` when ready.'),
    recipient: z.email().describe("Email address the export download link will be sent to."),
    rowCount: z.number().int().nonnegative().describe("Number of rows the export will produce."),
  })
  .openapi("ExportDatasetRowsQueuedResponse")

const ExportTooLargeResponseSchema = z
  .object({
    status: z.literal("too_large").describe('Always `"too_large"`. The export exceeds the synchronous threshold.'),
    rowCount: z.number().int().nonnegative().describe("Number of rows the export would have produced."),
    threshold: z.number().int().positive().describe("Maximum row count this endpoint will generate synchronously."),
    recommendedAction: z
      .string()
      .describe(
        "Instructions for the caller — typically an LLM — on how to recover: ask the end user for an email address and retry the same call with `recipient` set to it.",
      ),
  })
  .openapi("ExportDatasetRowsTooLargeResponse")

const listDatasetRowsEndpoint = datasetEndpoint({
  route: createRoute({
    method: "get",
    path: "/{datasetSlug}/rows",
    name: "listDatasetRows",
    tags: ["Datasets"],
    ...datasetsFernGroup("listRows"),
    summary: "List dataset rows",
    description: "Returns a cursor-paginated page of rows.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, query: ListRowsQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedDatasetRowsSchema, description: "Page of rows" }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let cursor: { createdAt: string; rowId: DatasetRowId } | undefined
        if (query.cursor) {
          const decoded = decodeRowCursor(query.cursor)
          if (!decoded) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          cursor = { createdAt: decoded.createdAt, rowId: DatasetRowId(decoded.rowId) }
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        const dataset = yield* datasetRepo.findBySlug({
          projectId: ProjectId(project.id as string),
          slug: datasetSlug,
        })

        return yield* listRows({
          datasetId: DatasetId(dataset.id as string),
          ...(query.search ? { search: query.search } : {}),
          sortDirection: query.sortDirection as SortDirection,
          limit: query.limit,
          ...(cursor ? { cursor } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(DatasetRowRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.rows.map(toDatasetRowResponse),
        nextCursor: page.nextCursor ? encodeRowCursor(page.nextCursor) : null,
        hasMore: page.nextCursor !== undefined,
      },
      200,
    )
  },
})

const insertDatasetRowsEndpoint = datasetEndpoint({
  route: createRoute({
    method: "post",
    path: "/{datasetSlug}/rows",
    name: "insertDatasetRows",
    tags: ["Datasets"],
    ...datasetsFernGroup("insertRows"),
    summary: "Insert dataset rows",
    description: "Appends one or more rows to the dataset.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, body: jsonBody(InsertRowBodySchema) },
    responses: openApiResponses({
      status: 201,
      schema: InsertRowsResponseSchema,
      description: "Rows inserted",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        const dataset = yield* datasetRepo.findBySlug({
          projectId: ProjectId(project.id as string),
          slug: datasetSlug,
        })

        return yield* insertRows({
          datasetId: DatasetId(dataset.id as string),
          rows: body.rows.map((r) => ({
            ...(r.id !== undefined ? { id: DatasetRowId(r.id) } : {}),
            input: r.input,
            ...(r.output !== undefined ? { output: r.output } : {}),
            ...(r.expectedOutput !== undefined ? { expectedOutput: r.expectedOutput } : {}),
            ...(r.metadata !== undefined ? { metadata: r.metadata } : {}),
          })),
          source: "api",
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(DatasetRowRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(
      {
        versionId: result.versionId as string,
        version: result.version,
        rowIds: result.rowIds.map((id: string) => id),
      },
      201,
    )
  },
})

const deleteDatasetRowsEndpoint = datasetEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{datasetSlug}/rows",
    name: "deleteDatasetRows",
    tags: ["Datasets"],
    ...datasetsFernGroup("deleteRows"),
    summary: "Delete dataset rows",
    description: "Deletes rows matching the supplied selection.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, body: jsonBody(DeleteRowsBodySchema) },
    responses: openApiResponses({
      status: 200,
      schema: DeleteRowsResponseSchema,
      description: "Rows deleted",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const datasetRepo = yield* DatasetRepository
        const dataset = yield* datasetRepo.findBySlug({
          projectId: ProjectId(project.id as string),
          slug: datasetSlug,
        })

        return yield* deleteRows({
          datasetId: DatasetId(dataset.id as string),
          selection:
            body.selection.mode === "selected"
              ? {
                  mode: "selected" as const,
                  rowIds: (body.selection.rowIds as readonly string[]).map(DatasetRowId),
                }
              : body.selection.mode === "allExcept"
                ? {
                    mode: "allExcept" as const,
                    rowIds: (body.selection.rowIds as readonly string[]).map(DatasetRowId),
                  }
                : { mode: "all" as const },
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(DatasetRowRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(
      {
        versionId: result.versionId,
        version: result.version,
        ...(result.deletedCount !== undefined ? { deletedCount: result.deletedCount } : {}),
      },
      200,
    )
  },
})

const importRowsFromTracesEndpoint = datasetEndpoint({
  route: createRoute({
    method: "post",
    path: "/{datasetSlug}/rows/import/traces",
    name: "importDatasetRowsFromTraces",
    tags: ["Datasets"],
    ...datasetsFernGroup("importRowsFromTraces"),
    summary: "Import dataset rows from traces",
    description: "Imports one row per trace matched by `traces`.",
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, body: jsonBody(ImportFromTracesBodySchema) },
    responses: openApiResponses({
      status: 201,
      schema: ImportFromTracesResponseSchema,
      description: "Rows imported",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const projectId = ProjectId(project.id as string)

        const datasetRepo = yield* DatasetRepository
        const dataset = yield* datasetRepo.findBySlug({ projectId, slug: datasetSlug })

        // Adapter per the M7 plan note: resolve the public `TracesRef` to a
        // concrete id list and call `addTracesToDataset` with the existing
        // `{ source, selection }` shape. The use-case stays as-is so the web
        // caller doesn't move.
        const tracesRef: TracesRef =
          body.traces.by === "ids"
            ? { by: "ids", ids: body.traces.ids.map((id) => TraceId(id)) }
            : { by: "filters", filters: body.traces.filters }

        const traceIds = yield* resolveTraceIdsFromRef(tracesRef, {
          organizationId: organizationId as string,
          projectId,
        })

        return yield* addTracesToDataset({
          projectId,
          datasetId: DatasetId(dataset.id as string),
          source: { kind: "project" as const },
          selection: { mode: "selected" as const, traceIds },
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(DatasetRowRepositoryLive, TraceRepositoryLive, ScoreAnalyticsRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(
      {
        versionId: result.versionId as string,
        version: result.version,
        rowIds: result.rowIds.map((id: string) => id),
      },
      201,
    )
  },
})

const exportDatasetRowsEndpoint = datasetEndpoint({
  route: createRoute({
    method: "post",
    path: "/{datasetSlug}/rows/export",
    name: "exportDatasetRows",
    tags: ["Datasets"],
    ...datasetsFernGroup("exportRows"),
    summary: "Export dataset rows",
    description:
      'Exports the selected rows as CSV. Returns one of three outcomes, discriminated by `status`:\n\n- `"ready"` — the export fit in the synchronous path. Body carries a short-lived signed `downloadUrl` the caller follows with a plain HTTP GET.\n- `"queued"` — the export was too large for the synchronous path AND a `recipient` was supplied. The CSV will be emailed to that address. The recipient must be a member of the requesting organization.\n- `"too_large"` — the export was too large for the synchronous path AND no `recipient` was supplied. Body includes a `recommendedAction` describing how to recover (typically: ask the user for an email and retry with `recipient` set).',
    security: PROTECTED_SECURITY,
    request: { params: DatasetSlugParamsSchema, body: jsonBody(ExportRowsBodySchema) },
    responses: {
      200: jsonResponse(ExportReadyResponseSchema, "CSV ready at the signed URL"),
      202: jsonResponse(ExportQueuedResponseSchema, "Export queued; download link will be emailed"),
      400: errorResponse("Validation error"),
      401: errorResponse("Unauthorized"),
      404: errorResponse("Not found"),
      413: jsonResponse(
        ExportTooLargeResponseSchema,
        "Export exceeds the synchronous threshold and no `recipient` was provided",
      ),
    },
  }),
  handler: async (c) => {
    const { projectSlug, datasetSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    // Resolve project + dataset once. We need the projectId and dataset.id for
    // the queue payload, and the membership check on `recipient` (if supplied)
    // should fail fast before we count rows or upload anything.
    const { projectId, datasetId } = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const pid = ProjectId(project.id as string)

        const datasetRepo = yield* DatasetRepository
        const ds = yield* datasetRepo.findBySlug({ projectId: pid, slug: datasetSlug })

        if (body.recipient !== undefined) {
          const membershipRepo = yield* MembershipRepository
          const isMember = yield* membershipRepo.findMemberByEmail(body.recipient)
          if (!isMember) {
            return yield* new BadRequestError({
              message: "`recipient` must belong to a member of this organization.",
            })
          }
        }

        return { projectId: pid, datasetId: DatasetId(ds.id as string) }
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, DatasetRepositoryLive, MembershipRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    const selection = body.selection ?? { mode: "all" as const }

    // Try the synchronous (small-dataset) path first. The use case counts
    // rows, returns "ready" with a signed URL when it fits, or "tooLarge"
    // when it doesn't — without uploading anything in the tooLarge case.
    const downloadResult = await Effect.runPromise(
      prepareDatasetDownloadUseCase({
        datasetId,
        organizationId: OrganizationId(organizationId as string),
        selection,
      }).pipe(
        withPostgres(DatasetRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(DatasetRowRepositoryLive, c.var.clickhouse, organizationId),
        Effect.provide(StorageDiskLive(c.var.storageDisk)),
        withTracing,
      ),
    )

    if (downloadResult.kind === "ready") {
      return c.json(
        {
          status: "ready" as const,
          downloadUrl: downloadResult.downloadUrl,
          filename: downloadResult.filename,
          expiresAt: downloadResult.expiresAt,
          rowCount: downloadResult.rowCount,
        },
        200,
      )
    }

    // Too large for the synchronous path. With no recipient we tell the
    // caller how to recover; with a recipient we queue the email flow.
    if (body.recipient === undefined) {
      return c.json(
        {
          status: "too_large" as const,
          rowCount: downloadResult.rowCount,
          threshold: downloadResult.threshold,
          recommendedAction: `This dataset has ${downloadResult.rowCount} rows, above the ${downloadResult.threshold}-row synchronous limit. Ask the end user for an email address to send the download link to, then retry this call with \`recipient\` set to that email.`,
        },
        413,
      )
    }

    await Effect.runPromise(
      c.var.queuePublisher
        .publish("exports", "generate", {
          kind: "dataset",
          organizationId: organizationId as string,
          projectId: projectId as string,
          datasetId: datasetId as string,
          recipientEmail: body.recipient,
          selection,
        })
        .pipe(withTracing),
    )

    return c.json(
      {
        status: "queued" as const,
        recipient: body.recipient,
        rowCount: downloadResult.rowCount,
      },
      202,
    )
  },
})

// TODO(file-imports): define how to upload binary files (CSV today, parquet
// tomorrow). The `POST /{datasetSlug}/rows/import/files` endpoint is
// intentionally deferred per plan decision D16 — the trace-import endpoint
// above covers the common ingestion path, and the JSON-only import shape
// keeps the SDK + MCP surfaces uniform until we settle on a multipart story.

export const createDatasetsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listDatasetsEndpoint.mountHttp(app, createTierRateLimiter("low"))
  getDataset.mountHttp(app, createTierRateLimiter("low"))
  createDatasetEndpoint.mountHttp(app, createTierRateLimiter("high"))
  updateDataset.mountHttp(app, createTierRateLimiter("low"))
  deleteDatasetEndpoint.mountHttp(app, createTierRateLimiter("low"))
  listDatasetRowsEndpoint.mountHttp(app, createTierRateLimiter("low"))
  insertDatasetRowsEndpoint.mountHttp(app, createTierRateLimiter("medium"))
  deleteDatasetRowsEndpoint.mountHttp(app, createTierRateLimiter("medium"))
  importRowsFromTracesEndpoint.mountHttp(app, createTierRateLimiter("high"))
  exportDatasetRowsEndpoint.mountHttp(app, createTierRateLimiter("critical"))
  return app
}
