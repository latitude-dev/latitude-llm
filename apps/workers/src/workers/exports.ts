import { promisify } from "node:util"
import { gzip } from "node:zlib"
import { buildDatasetExportUseCase } from "@domain/datasets"
import { type EmailSender, exportReadyTemplate, type RenderedEmail, sendEmail } from "@domain/email"
import type { ExportPayload } from "@domain/exports"
import { buildIssuesExportUseCase, embedIssueSearchQueryUseCase, IssueProjectionRepository } from "@domain/issues"
import type { QueueConsumer } from "@domain/queue"
import {
  DatasetId,
  type FilterSet,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  ProjectId,
  type ProjectId as ProjectIdType,
  putInDisk,
  type StorageDiskPort,
} from "@domain/shared"
import { buildTracesExportUseCase } from "@domain/spans"
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
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient, getWeaviateClient } from "../clients.ts"

const gzipAsync = promisify(gzip)

class ExportError extends Data.TaggedError("ExportError")<{
  readonly cause: unknown
  readonly kind?: string
}> {}

const logger = createLogger("exports")
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

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

async function compressCsv(csv: string): Promise<Uint8Array> {
  const compressed = await gzipAsync(csv)
  return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)
}

type IssuesExportInput = {
  readonly organizationId: OrganizationIdType
  readonly projectId: ProjectIdType
  readonly selection?: Extract<ExportPayload, { kind: "issues" }>["selection"]
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
    readonly field: "lastSeen" | "occurrences" | "state"
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

function generateDatasetExport(
  organizationId: OrganizationIdType,
  datasetId: DatasetId,
  selection: Extract<ExportPayload, { kind: "dataset" }>["selection"],
) {
  return buildDatasetExportUseCase({ datasetId, selection }).pipe(
    withPostgres(DatasetRepositoryLive, getPostgresClient(), organizationId),
    withClickHouse(DatasetRowRepositoryLive, getClickhouseClient(), organizationId),
  )
}

function generateTracesExport(
  organizationId: OrganizationIdType,
  projectId: ProjectIdType,
  filters?: FilterSet,
  selection?: Extract<ExportPayload, { kind: "traces" }>["selection"],
) {
  return buildTracesExportUseCase({
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
    readonly selection?: Extract<ExportPayload, { kind: "issues" }>["selection"]
    readonly lifecycleGroup?: "active" | "archived"
    readonly searchQuery?: string
    readonly timeRange?: {
      readonly fromIso?: string | undefined
      readonly toIso?: string | undefined
    }
    readonly sort?: {
      readonly field: "lastSeen" | "occurrences" | "state"
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
    return buildIssuesExportUseCase(baseEffectInput).pipe(
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

    return yield* buildIssuesExportUseCase({
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

function dispatchExport(payload: ExportPayload) {
  const organizationId = OrganizationId(payload.organizationId)
  const projectId = ProjectId(payload.projectId)

  switch (payload.kind) {
    case "dataset":
      return generateDatasetExport(organizationId, DatasetId(payload.datasetId), payload.selection)
    case "traces":
      return generateTracesExport(organizationId, projectId, payload.filters, payload.selection)
    case "issues":
      return generateIssuesExport(organizationId, projectId, {
        ...(payload.selection ? { selection: payload.selection } : {}),
        ...(payload.lifecycleGroup ? { lifecycleGroup: payload.lifecycleGroup } : {}),
        ...(payload.searchQuery ? { searchQuery: payload.searchQuery } : {}),
        ...(payload.timeRange ? { timeRange: payload.timeRange } : {}),
        ...(payload.sort ? { sort: payload.sort } : {}),
      })
    default:
      return Effect.fail(new ExportError({ cause: new Error("Unknown export kind") }))
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
        const kind = payload.kind
        const { csv, filename, exportName } = yield* dispatchExport(payload as ExportPayload)

        const content = yield* Effect.tryPromise({
          try: () => compressCsv(csv),
          catch: (cause) => new ExportError({ cause, kind }),
        })

        const fileKey = yield* putInDisk(disk, {
          namespace: "exports",
          organizationId,
          projectId,
          content,
          filename,
        })

        const downloadUrl = yield* Effect.tryPromise({
          try: async (): Promise<string> =>
            String(
              await disk.getSignedUrl(fileKey, {
                expiresIn: SIGNED_URL_EXPIRY_SECONDS,
              }),
            ),
          catch: (cause: unknown) => new ExportError({ cause, kind }),
        })

        const rendered = yield* Effect.tryPromise({
          try: (): Promise<RenderedEmail> =>
            exportReadyTemplate({
              exportName,
              downloadUrl,
            }),
          catch: (cause: unknown) => new ExportError({ cause, kind }),
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
