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
import { buildExportFilename, type DatasetExportSelection, type ExportPayload } from "@domain/exports"
import { IssueRepository } from "@domain/issues"
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
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { DatasetRowRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { DatasetRepositoryLive, IssueRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createStorageDisk } from "@platform/storage-object"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const gzipAsync = promisify(gzip)

class ExportError extends Data.TaggedError("ExportError")<{
  readonly cause: unknown
  readonly kind?: string
}> {}

const logger = createLogger("exports")

const BATCH_SIZE = 1000
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

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
function generateDatasetExport(
  organizationId: OrganizationIdType,
  _projectId: ProjectIdType,
  datasetId: DatasetId,
  selection: DatasetExportSelection,
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
  }).pipe(
    withPostgres(DatasetRepositoryLive, getPostgresClient(), organizationId),
    withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), organizationId),
  )
}

/**
 * Generates a traces export CSV.
 */
function generateTracesExport(organizationId: OrganizationIdType, projectId: ProjectIdType, filters?: FilterSet) {
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

    // Stream traces using cursor pagination
    let cursor: { sortValue: string; traceId: string } | undefined
    while (true) {
      const page = yield* traceRepo.listByProjectId({
        organizationId,
        projectId,
        options: {
          limit: BATCH_SIZE,
          ...(cursor ? { cursor } : {}),
          ...(filters ? { filters } : {}),
          sortBy: "startTime",
          sortDirection: "desc",
        },
      })

      if (page.items.length === 0) break

      for (const trace of page.items) {
        csvRows.push([
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
          JSON.stringify(trace.metadata),
          trace.models.join("|"),
          trace.providers.join("|"),
          trace.serviceNames.join("|"),
          trace.rootSpanId,
          trace.rootSpanName,
        ])
      }

      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
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
  }).pipe(withClickHouse(TraceRepositoryLive, getClickhouseClient(), organizationId))
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
function generateIssuesExport(organizationId: OrganizationIdType, projectId: ProjectIdType) {
  return Effect.gen(function* () {
    const issueRepo = yield* IssueRepository

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

    // Stream issues using offset pagination
    let offset = 0
    while (true) {
      const page = yield* issueRepo.list({
        projectId,
        limit: BATCH_SIZE,
        offset,
      })

      if (page.items.length === 0) break

      for (const issue of page.items) {
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
      }

      if (!page.hasMore) break
      offset += BATCH_SIZE
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
  }).pipe(withPostgres(IssueRepositoryLive, getPostgresClient(), organizationId))
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
      return generateTracesExport(organizationId, projectId, filters)
    }
    case "issues":
      return generateIssuesExport(organizationId, projectId)
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
