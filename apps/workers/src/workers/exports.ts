import { promisify } from "node:util"
import { gzip } from "node:zlib"
import {
  csvExportHeader,
  DatasetRepository,
  type DatasetRow,
  DatasetRowRepository,
  rowsToCsvFragment,
} from "@domain/datasets"
import { type EmailSender, exportReadyTemplate, type RenderedEmail, sendEmail } from "@domain/email"
import { buildExportFilename, type ExportPayload, type ExportSelection } from "@domain/exports"
import { embedIssueSearchQueryUseCase, IssueProjectionRepository, listIssuesUseCase } from "@domain/issues"
import type { QueueConsumer } from "@domain/queue"
import {
  DatasetId,
  DatasetRowId,
  type FilterSet,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  ProjectId,
  type ProjectId as ProjectIdType,
  putInDisk,
  type StorageDiskPort,
  TraceId,
} from "@domain/shared"
import { type Trace, TraceRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  DatasetRowRepositoryLive,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  DatasetRepositoryLive,
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { IssueProjectionRepositoryLive, withWeaviate } from "@platform/db-weaviate"
import { createEmailTransportSender } from "@platform/email-transport"
import { createStorageDisk } from "@platform/storage-object"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer, Schema } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient, getWeaviateClient } from "../clients.ts"

const gzipAsync = promisify(gzip)

class ExportError extends Data.TaggedError("ExportError")<{
  readonly cause: unknown
  readonly kind?: string
}> {}

const logger = createLogger("exports")

const BATCH_SIZE = 1000
const ISSUES_EXPORT_BATCH_SIZE = 100
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60
const traceMetadataFromJsonStringSchema = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String))

const withEmptyIssueProjection = Effect.provide(
  Layer.succeed(IssueProjectionRepository, {
    upsert: () => Effect.void,
    delete: () => Effect.void,
    hybridSearch: () => Effect.succeed([]),
  }),
)

interface ExportsWorkerDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  disk?: StorageDiskPort
  emailSender?: EmailSender
}

/**
 * Compresses CSV content using gzip.
 */
async function compressCsv(csv: string): Promise<Uint8Array> {
  const compressed = await gzipAsync(csv)
  return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)
}

/**
 * Generates a dataset export CSV.
 */
function buildDatasetExportEffect(
  _organizationId: OrganizationIdType,
  _projectId: ProjectIdType,
  datasetId: DatasetId,
  selection: ExportSelection,
) {
  return Effect.gen(function* () {
    const datasetRepo = yield* DatasetRepository
    const dataset = yield* datasetRepo.findById(datasetId)

    const rowRepo = yield* DatasetRowRepository
    const csvChunks: string[] = [csvExportHeader()]

    // First pass: collect all rows if we need to filter by selection
    if (selection.mode !== "all") {
      // For selected/allExcept modes, we need to get all rows to filter
      const allRows: DatasetRow[] = []
      let offset = 0
      while (true) {
        const rows = yield* rowRepo.listPage({
          datasetId,
          limit: BATCH_SIZE,
          offset,
        })
        if (rows.length === 0) break
        allRows.push(...rows)
        if (rows.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }

      // Apply selection filter
      const selectedIds =
        selection.mode === "selected" || selection.mode === "allExcept"
          ? new Set(selection.rowIds.map((id) => DatasetRowId(id)))
          : null

      const filteredRows =
        selection.mode === "selected"
          ? allRows.filter((r: DatasetRow) => selectedIds?.has(r.rowId))
          : selection.mode === "allExcept"
            ? allRows.filter((r: DatasetRow) => !selectedIds?.has(r.rowId))
            : allRows

      if (filteredRows.length > 0) {
        csvChunks.push(rowsToCsvFragment(filteredRows))
      }
    } else {
      // For "all" mode, stream in batches
      let offset = 0
      while (true) {
        const rows = yield* rowRepo.listPage({
          datasetId,
          limit: BATCH_SIZE,
          offset,
        })
        if (rows.length === 0) break
        csvChunks.push(rowsToCsvFragment(rows))
        if (rows.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }

    const csv = csvChunks.join("")
    const compressed = yield* Effect.tryPromise({
      try: () => compressCsv(csv),
      catch: (e) => new ExportError({ cause: e, kind: "dataset" }),
    })

    return {
      content: compressed,
      filename: buildExportFilename("dataset", dataset.name),
      exportName: dataset.name,
    }
  })
}

/**
 * Generates a traces export CSV.
 */
const traceToCsvRow = (trace: Trace): string[] => [
  trace.traceId,
  String(trace.spanCount),
  String(trace.errorCount),
  trace.startTime.toISOString(),
  trace.endTime.toISOString(),
  String(trace.durationNs),
  String(trace.timeToFirstTokenNs),
  String(trace.tokensInput),
  String(trace.tokensOutput),
  String(trace.tokensCacheRead),
  String(trace.tokensCacheCreate),
  String(trace.tokensReasoning),
  String(trace.tokensTotal),
  String(trace.costInputMicrocents),
  String(trace.costOutputMicrocents),
  String(trace.costTotalMicrocents),
  trace.sessionId,
  trace.userId,
  trace.simulationId || "",
  trace.tags.join("|"),
  Schema.encodeSync(traceMetadataFromJsonStringSchema)(trace.metadata),
  trace.models.join("|"),
  trace.providers.join("|"),
  trace.serviceNames.join("|"),
  trace.rootSpanId,
  trace.rootSpanName,
]

export function buildTracesExportEffect(input: {
  readonly organizationId: OrganizationIdType
  readonly projectId: ProjectIdType
  readonly filters?: FilterSet
  readonly selection?: ExportSelection
}) {
  return Effect.gen(function* () {
    const traceRepo = yield* TraceRepository

    // Use the listing shape columns as the source of truth for v1
    const headers = [
      "traceId",
      "spanCount",
      "errorCount",
      "startTime",
      "endTime",
      "durationNs",
      "timeToFirstTokenNs",
      "tokensInput",
      "tokensOutput",
      "tokensCacheRead",
      "tokensCacheCreate",
      "tokensReasoning",
      "tokensTotal",
      "costInputMicrocents",
      "costOutputMicrocents",
      "costTotalMicrocents",
      "sessionId",
      "userId",
      "simulationId",
      "tags",
      "metadata",
      "models",
      "providers",
      "serviceNames",
      "rootSpanId",
      "rootSpanName",
    ]

    const csvRows: string[][] = [headers]

    const appendTraces = (traces: readonly Trace[]) => {
      for (const trace of traces) {
        csvRows.push(traceToCsvRow(trace))
      }
    }

    if (input.selection?.mode === "selected") {
      const selectedTraceIds = input.selection.rowIds.map((traceId) => TraceId(traceId))
      const traces = yield* traceRepo.listByTraceIds({
        organizationId: input.organizationId,
        projectId: input.projectId,
        traceIds: selectedTraceIds,
      })
      const tracesById = new Map(traces.map((trace) => [trace.traceId, trace] as const))

      for (const traceId of selectedTraceIds) {
        const trace = tracesById.get(traceId)
        if (!trace) continue

        if (input.filters) {
          const matches = yield* traceRepo.matchesFiltersByTraceId({
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId,
            filters: input.filters,
          })

          if (!matches) continue
        }

        appendTraces([trace])
      }
    } else {
      const excludedTraceIds =
        input.selection?.mode === "allExcept"
          ? new Set(input.selection.rowIds.map((traceId) => TraceId(traceId)))
          : null

      let cursor: { sortValue: string; traceId: string } | undefined
      while (true) {
        const page = yield* traceRepo.listByProjectId({
          organizationId: input.organizationId,
          projectId: input.projectId,
          options: {
            limit: BATCH_SIZE,
            ...(cursor ? { cursor } : {}),
            ...(input.filters ? { filters: input.filters } : {}),
            sortBy: "startTime",
            sortDirection: "desc",
          },
        })

        if (page.items.length === 0) break

        appendTraces(excludedTraceIds ? page.items.filter((trace) => !excludedTraceIds.has(trace.traceId)) : page.items)

        if (!page.hasMore || !page.nextCursor) break
        cursor = page.nextCursor
      }
    }

    // Convert to CSV string
    const csv = csvRows.map((row) => row.map(escapeCsvField).join(",")).join("\n")

    const compressed = yield* Effect.tryPromise({
      try: () => compressCsv(csv),
      catch: (e) => new ExportError({ cause: e, kind: "traces" }),
    })

    return {
      content: compressed,
      filename: buildExportFilename("traces", "project_traces"),
      exportName: "Project Traces",
    }
  })
}

/**
 * Escapes a field for CSV output.
 */
function escapeCsvField(value: string): string {
  // If the value contains commas, quotes, or newlines, wrap it in quotes
  if (/[",\n\r]/.test(value)) {
    // Escape quotes by doubling them
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Generates an issues export CSV.
 */
type IssuesExportInput = {
  readonly organizationId: OrganizationIdType
  readonly projectId: ProjectIdType
  readonly selection?: ExportSelection
  readonly lifecycleGroup?: "active" | "archived"
  readonly search?: {
    readonly query: string
    readonly normalizedEmbedding: number[]
  }
  readonly timeRange?: {
    readonly from?: Date
    readonly to?: Date
  }
  readonly sort?: {
    readonly field: "lastSeen" | "occurrences"
    readonly direction: "asc" | "desc"
  }
}

const toIssueTimeRange = (
  timeRange:
    | {
        readonly fromIso?: string | undefined
        readonly toIso?: string | undefined
      }
    | undefined,
): IssuesExportInput["timeRange"] => {
  if (!timeRange?.fromIso && !timeRange?.toIso) {
    return undefined
  }

  return {
    ...(timeRange.fromIso ? { from: new Date(timeRange.fromIso) } : {}),
    ...(timeRange.toIso ? { to: new Date(timeRange.toIso) } : {}),
  }
}

export function buildIssuesExportEffect(input: IssuesExportInput) {
  return Effect.gen(function* () {
    const selectionIds =
      input.selection?.mode === "all" || input.selection === undefined ? null : new Set(input.selection.rowIds)
    const remainingSelectedIds = input.selection?.mode === "selected" ? new Set(input.selection.rowIds) : null

    // V1 minimal canonical columns per plan
    const headers = [
      "id",
      "uuid",
      "name",
      "description",
      "createdAt",
      "updatedAt",
      "escalatedAt",
      "resolvedAt",
      "ignoredAt",
    ]

    const csvRows: string[][] = [headers]

    let offset = 0
    while (true) {
      const page = yield* listIssuesUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        limit: ISSUES_EXPORT_BATCH_SIZE,
        offset,
        ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
        ...(input.search ? { search: input.search } : {}),
        ...(input.timeRange ? { timeRange: input.timeRange } : {}),
        ...(input.sort ? { sort: input.sort } : {}),
      })

      if (page.items.length === 0) break

      for (const issue of page.items) {
        if (input.selection?.mode === "selected" && !selectionIds?.has(issue.id)) {
          continue
        }

        if (input.selection?.mode === "allExcept" && selectionIds?.has(issue.id)) {
          continue
        }

        csvRows.push([
          issue.id,
          issue.uuid,
          escapeCsvField(issue.name),
          escapeCsvField(issue.description),
          issue.createdAt.toISOString(),
          issue.updatedAt.toISOString(),
          issue.escalatedAt?.toISOString() ?? "",
          issue.resolvedAt?.toISOString() ?? "",
          issue.ignoredAt?.toISOString() ?? "",
        ])

        remainingSelectedIds?.delete(issue.id)
      }

      if (remainingSelectedIds && remainingSelectedIds.size === 0) break
      if (!page.hasMore) break
      offset += page.limit
    }

    // Convert to CSV string
    const csv = csvRows.map((row) => row.join(",")).join("\n")

    const compressed = yield* Effect.tryPromise({
      try: () => compressCsv(csv),
      catch: (e) => new ExportError({ cause: e, kind: "issues" }),
    })

    return {
      content: compressed,
      filename: buildExportFilename("issues", "project_issues"),
      exportName: "Project Issues",
    }
  })
}

function generateDatasetExport(
  organizationId: OrganizationIdType,
  projectId: ProjectIdType,
  datasetId: DatasetId,
  selection: ExportSelection,
) {
  return buildDatasetExportEffect(organizationId, projectId, datasetId, selection).pipe(
    withPostgres(DatasetRepositoryLive, getPostgresClient(), organizationId),
    withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), organizationId),
  )
}

function generateTracesExport(
  organizationId: OrganizationIdType,
  projectId: ProjectIdType,
  filters?: FilterSet,
  selection?: ExportSelection,
) {
  return buildTracesExportEffect({
    organizationId,
    projectId,
    ...(filters ? { filters } : {}),
    ...(selection ? { selection } : {}),
  }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), organizationId))
}

function generateIssuesExport(
  organizationId: OrganizationIdType,
  projectId: ProjectIdType,
  input: {
    readonly selection?: ExportSelection
    readonly lifecycleGroup?: "active" | "archived"
    readonly searchQuery?: string
    readonly timeRange?: {
      readonly fromIso?: string | undefined
      readonly toIso?: string | undefined
    }
    readonly sort?: {
      readonly field: "lastSeen" | "occurrences"
      readonly direction: "asc" | "desc"
    }
  },
) {
  const timeRange = toIssueTimeRange(input.timeRange)
  const baseEffectInput = {
    organizationId,
    projectId,
    ...(input.selection ? { selection: input.selection } : {}),
    ...(input.lifecycleGroup ? { lifecycleGroup: input.lifecycleGroup } : {}),
    ...(input.sort ? { sort: input.sort } : {}),
    ...(timeRange ? { timeRange } : {}),
  } satisfies Omit<IssuesExportInput, "search">

  const trimmedSearchQuery = input.searchQuery?.trim() || undefined
  if (!trimmedSearchQuery) {
    return buildIssuesExportEffect(baseEffectInput).pipe(
      withPostgres(Layer.mergeAll(EvaluationRepositoryLive, IssueRepositoryLive), getPostgresClient(), organizationId),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), organizationId),
      withEmptyIssueProjection,
    )
  }

  return Effect.gen(function* () {
    const search = yield* embedIssueSearchQueryUseCase({
      organizationId,
      projectId,
      query: trimmedSearchQuery,
    }).pipe(withAi(AIEmbedLive, getRedisClient()))
    const weaviateClient = yield* Effect.tryPromise({
      try: () => getWeaviateClient(),
      catch: (cause) => new ExportError({ cause, kind: "issues" }),
    })

    return yield* buildIssuesExportEffect({
      ...baseEffectInput,
      search: {
        query: search.query,
        normalizedEmbedding: search.normalizedEmbedding,
      },
    }).pipe(
      withPostgres(Layer.mergeAll(EvaluationRepositoryLive, IssueRepositoryLive), getPostgresClient(), organizationId),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), organizationId),
      withWeaviate(IssueProjectionRepositoryLive, weaviateClient, organizationId),
    )
  })
}

/**
 * Dispatches export generation by kind.
 */
function dispatchExport(payload: ExportPayload) {
  const organizationId = OrganizationId(payload.organizationId)
  const projectId = ProjectId(payload.projectId)

  switch (payload.kind) {
    case "dataset": {
      const datasetId = DatasetId(payload.datasetId)
      return generateDatasetExport(organizationId, projectId, datasetId, payload.selection)
    }
    case "traces": {
      // Cast filters to FilterSet - the queue payload is validated at the boundary
      const filters = payload.filters as FilterSet | undefined
      const selection = payload.selection as ExportSelection | undefined
      return generateTracesExport(organizationId, projectId, filters, selection)
    }
    case "issues": {
      const selection = payload.selection as ExportSelection | undefined
      return generateIssuesExport(organizationId, projectId, {
        ...(selection ? { selection } : {}),
        ...(payload.lifecycleGroup ? { lifecycleGroup: payload.lifecycleGroup } : {}),
        ...(payload.searchQuery ? { searchQuery: payload.searchQuery } : {}),
        ...(payload.timeRange ? { timeRange: payload.timeRange } : {}),
        ...(payload.sort ? { sort: payload.sort } : {}),
      })
    }
    default:
      return Effect.fail(new ExportError({ cause: new Error(`Unknown export kind`) }))
  }
}

export const createExportsWorker = ({
  consumer,
  postgresClient: _postgresClient,
  clickhouseClient: _clickhouseClient,
  disk: diskDep,
  emailSender,
}: ExportsWorkerDeps) => {
  const disk = diskDep ?? createStorageDisk()
  const sendEmailUseCase = sendEmail({ emailSender: emailSender ?? createEmailTransportSender() })
  const workerLogger = logger

  consumer.subscribe("exports", {
    generate: (payload) => {
      const organizationId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)

      return Effect.gen(function* () {
        // Dispatch to appropriate generator based on kind
        const kind = payload.kind
        const { content, filename, exportName } = yield* dispatchExport(payload as ExportPayload)

        // Store the compressed artifact
        const fileKey = yield* putInDisk(disk, {
          namespace: "exports",
          organizationId,
          projectId,
          content,
          filename,
        })

        // Generate signed URL
        const downloadUrl = yield* Effect.tryPromise({
          try: async (): Promise<string> =>
            String(
              await disk.getSignedUrl(fileKey, {
                expiresIn: SIGNED_URL_EXPIRY_SECONDS,
              }),
            ),
          catch: (e: unknown) => new ExportError({ cause: e, kind }),
        })

        // Send export-ready email
        const rendered = yield* Effect.tryPromise({
          try: (): Promise<RenderedEmail> =>
            exportReadyTemplate({
              exportName,
              downloadUrl,
            }),
          catch: (e: unknown) => new ExportError({ cause: e, kind }),
        })

        yield* sendEmailUseCase({
          to: payload.recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            workerLogger.info(`Export completed: kind=${payload.kind}, projectId=${payload.projectId}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            workerLogger.error(`Export failed: kind=${payload.kind}, projectId=${payload.projectId}`, error),
          ),
        ),
        withTracing,
      )
    },
  })
}
