/**
 * Server-fns backing the project-scoped **Data destinations** settings.
 * Org-scoped authz at the boundary: every fn resolves the active org from the
 * session and drives the domain use-cases through the org-scoped Postgres
 * client so RLS isolates tenants. The `destinations` feature flag gates UI
 * visibility and the sync sweep — not these calls. Credentials never cross the
 * wire — {@link toRecord} strips them.
 */
import {
  createDestinationUseCase,
  createPosthogMapper,
  type Destination,
  type DestinationConfig,
  type DestinationDelivererRegistry,
  DestinationDeliverers,
  type DestinationMapperRegistry,
  DestinationMappers,
  DestinationRepository,
  type DestinationSource,
  type DestinationSourceConfig,
  type DestinationSourceState,
  DestinationSourceStateRepository,
  type DestinationStatus,
  type DestinationSyncRun,
  DestinationSyncRunRepository,
  type DestinationSyncRunStatus,
  deleteDestinationUseCase,
  destinationConfigPatchSchema,
  destinationConfigSchema,
  destinationCredentialsSchema,
  destinationSourceConfigSchema,
  destinationSourceSchema,
  pauseDestinationUseCase,
  previewCredentials,
  previewDestinationDeliveryUseCase,
  resumeDestinationUseCase,
  SpansSourceReadersLive,
  type TestDestinationConnectionResult,
  testDestinationConnectionUseCase,
  updateDestinationUseCase,
} from "@domain/destinations"
import { DestinationId, DestinationSyncRunId, ProjectId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { createPosthogDeliverer } from "@platform/data-destinations"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  DestinationRepositoryLive,
  DestinationSourceStateRepositoryLive,
  DestinationSyncRunRepositoryLive,
  OrganizationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

/** Wire projection of one enabled/disabled source on a destination. */
export interface DestinationSourceRecord {
  readonly source: DestinationSource
  readonly status: DestinationSourceState["status"]
  readonly config: DestinationSourceConfig
}

/** Wire projection of {@link Destination}. Omits `credentials` — secrets stay server-side. */
export interface DestinationRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly kind: Destination["kind"]
  readonly name: string
  readonly config: DestinationConfig
  /** Masked fragment of the stored credentials (prefix + last 4) — never the full secret. */
  readonly credentialsPreview: string
  readonly status: DestinationStatus
  readonly consecutiveFailures: number
  readonly lastFailureMessage: string | null
  /** Per-source config + status — what the edit form's Sources section reads. */
  readonly sources: readonly DestinationSourceRecord[]
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (destination: Destination, sources: readonly DestinationSourceState[]): DestinationRecord => ({
  id: destination.id,
  organizationId: destination.organizationId,
  projectId: destination.projectId,
  kind: destination.kind,
  name: destination.name,
  config: destination.config,
  credentialsPreview: previewCredentials(destination.credentials),
  status: destination.status,
  consecutiveFailures: destination.consecutiveFailures,
  lastFailureMessage: destination.lastFailureMessage,
  sources: sources.map((s) => ({ source: s.source, status: s.status, config: s.config })),
  createdAt: destination.createdAt.toISOString(),
  updatedAt: destination.updatedAt.toISOString(),
})

/** Builds the wire record, fetching the destination's per-source rows. Requires the source-state repo in the layer. */
const buildRecord = (destination: Destination) =>
  Effect.gen(function* () {
    const sourceStates = yield* DestinationSourceStateRepository
    const sources = yield* sourceStates.listByDestinationId(destination.id)
    return toRecord(destination, sources)
  })

export const listDestinations = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly DestinationRecord[]> => {
    const { organizationId } = await requireSession()

    const records = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DestinationRepository
        const destinations = yield* repo.listByProjectId(ProjectId(data.projectId))
        return yield* Effect.forEach(destinations, buildRecord)
      }).pipe(
        withPostgres(
          Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return records
  })

const createDestinationSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(256),
  config: destinationConfigSchema,
  credentials: destinationCredentialsSchema,
  sourceConfigs: z.array(destinationSourceConfigSchema).optional(),
})

export const createDestination = createServerFn({ method: "POST" })
  .inputValidator(createDestinationSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId, userId } = await requireSession()

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const destination = yield* createDestinationUseCase({
          organizationId,
          projectId: ProjectId(data.projectId),
          name: data.name,
          config: data.config,
          credentials: data.credentials,
          createdByUserId: userId,
          ...(data.sourceConfigs === undefined ? {} : { sourceConfigs: data.sourceConfigs }),
        })
        return yield* buildRecord(destination)
      }).pipe(
        withPostgres(
          Layer.mergeAll(OrganizationRepositoryLive, DestinationRepositoryLive, DestinationSourceStateRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return record
  })

const updateDestinationSchema = z.object({
  projectId: z.string(),
  destinationId: z.string(),
  name: z.string().min(1).max(256).optional(),
  config: destinationConfigPatchSchema.optional(),
  credentials: destinationCredentialsSchema.optional(),
  sourceConfigs: z.array(destinationSourceConfigSchema).optional(),
})

export const updateDestination = createServerFn({ method: "POST" })
  .inputValidator(updateDestinationSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const destination = yield* updateDestinationUseCase({
          organizationId,
          projectId: ProjectId(data.projectId),
          destinationId: DestinationId(data.destinationId),
          name: data.name,
          config: data.config,
          credentials: data.credentials,
          sourceConfigs: data.sourceConfigs,
        })
        return yield* buildRecord(destination)
      }).pipe(
        withPostgres(
          Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return record
  })

const destinationActionSchema = z.object({
  projectId: z.string(),
  destinationId: z.string(),
})

export const pauseDestination = createServerFn({ method: "POST" })
  .inputValidator(destinationActionSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const destination = yield* pauseDestinationUseCase({
          organizationId,
          projectId: ProjectId(data.projectId),
          destinationId: DestinationId(data.destinationId),
        })
        return yield* buildRecord(destination)
      }).pipe(
        withPostgres(
          Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return record
  })

export const resumeDestination = createServerFn({ method: "POST" })
  .inputValidator(destinationActionSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const destination = yield* resumeDestinationUseCase({
          organizationId,
          projectId: ProjectId(data.projectId),
          destinationId: DestinationId(data.destinationId),
        })
        return yield* buildRecord(destination)
      }).pipe(
        withPostgres(
          Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return record
  })

export const deleteDestination = createServerFn({ method: "POST" })
  .inputValidator(destinationActionSchema)
  .handler(async ({ data }): Promise<{ readonly deleted: true }> => {
    const { organizationId } = await requireSession()

    await Effect.runPromise(
      deleteDestinationUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        destinationId: DestinationId(data.destinationId),
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            DestinationRepositoryLive,
            DestinationSourceStateRepositoryLive,
            DestinationSyncRunRepositoryLive,
          ),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return { deleted: true } as const
  })

/**
 * Outcome of a pre-save connection probe. `ok=false` carries a sanitized
 * reason and whether retrying could succeed (transport/5xx/429) vs the
 * config/key needing a fix (401). The adapter probes an endpoint that
 * authenticates the key (no telemetry sent); a pass proves the key maps to a
 * real project, not that it's the project the user intended.
 */
export interface DestinationConnectionTestResult {
  readonly ok: boolean
  readonly retryable: boolean
  readonly reason: string | null
  readonly upstreamStatus: number | null
}

const toConnectionTestResult = (result: TestDestinationConnectionResult): DestinationConnectionTestResult =>
  result.status === "ok"
    ? { ok: true, retryable: false, reason: null, upstreamStatus: null }
    : { ok: false, retryable: result.retryable, reason: result.reason, upstreamStatus: result.upstreamStatus ?? null }

const destinationDeliverers: DestinationDelivererRegistry = {
  posthog: createPosthogDeliverer(),
}

const testDestinationConnectionSchema = z.object({
  config: destinationConfigSchema,
  credentials: destinationCredentialsSchema,
})

export const testDestinationConnection = createServerFn({ method: "POST" })
  .inputValidator(testDestinationConnectionSchema)
  .handler(async ({ data }): Promise<DestinationConnectionTestResult> => {
    await requireSession()

    const result = await Effect.runPromise(
      testDestinationConnectionUseCase({
        config: data.config,
        credentials: data.credentials,
      }).pipe(Effect.provideService(DestinationDeliverers, destinationDeliverers), withTracing),
    )

    return toConnectionTestResult(result)
  })

const testExistingDestinationConnectionSchema = z.object({
  destinationId: z.string(),
  config: destinationConfigSchema,
})

/**
 * Probe an already-saved destination with its stored (write-only) credentials,
 * so the edit form can verify the connection without re-entering the secret.
 * The edited `config` from the form is used; the key comes from storage.
 */
export const testExistingDestinationConnection = createServerFn({ method: "POST" })
  .inputValidator(testExistingDestinationConnectionSchema)
  .handler(async ({ data }): Promise<DestinationConnectionTestResult> => {
    const { organizationId } = await requireSession()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DestinationRepository
        const destination = yield* repo.findById(DestinationId(data.destinationId))
        return yield* testDestinationConnectionUseCase({
          config: data.config,
          credentials: destination.credentials,
        }).pipe(Effect.provideService(DestinationDeliverers, destinationDeliverers))
      }).pipe(withPostgres(DestinationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return toConnectionTestResult(result)
  })

/** Wire projection of one {@link DestinationSyncRun}. Powers the card summary and the run-history list. */
export interface DestinationSyncRunRecord {
  readonly id: string
  readonly source: DestinationSource
  readonly status: DestinationSyncRunStatus
  readonly recordsRead: number
  readonly eventsSent: number
  readonly eventsDropped: number
  readonly error: string | null
  readonly windowStart: string
  readonly windowEnd: string
  readonly startedAt: string
  readonly finishedAt: string
}

const toSyncRunRecord = (run: DestinationSyncRun): DestinationSyncRunRecord => ({
  id: run.id,
  source: run.source,
  status: run.status,
  recordsRead: run.recordsRead,
  eventsSent: run.eventsSent,
  eventsDropped: run.eventsDropped,
  error: run.error,
  windowStart: run.windowStart.toISOString(),
  windowEnd: run.windowEnd.toISOString(),
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt.toISOString(),
})

export const getLatestDestinationSyncRun = createServerFn({ method: "GET" })
  .inputValidator(z.object({ destinationId: z.string() }))
  .handler(async ({ data }): Promise<DestinationSyncRunRecord | null> => {
    const { organizationId } = await requireSession()

    const runs = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({
          destinationId: DestinationId(data.destinationId),
          limit: 1,
        })
      }).pipe(withPostgres(DestinationSyncRunRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    const run = runs[0]
    return run ? toSyncRunRecord(run) : null
  })

interface DestinationSyncRunPage {
  readonly runs: readonly DestinationSyncRunRecord[]
  readonly nextCursor: {
    readonly startedAt: string
    readonly id: string
  } | null
}

const DESTINATION_SYNC_RUNS_PAGE_SIZE = 25

const listDestinationSyncRunsSchema = z.object({
  destinationId: z.string(),
  before: z.object({ startedAt: z.string(), id: z.string() }).optional(),
})

export const listDestinationSyncRuns = createServerFn({ method: "GET" })
  .inputValidator(listDestinationSyncRunsSchema)
  .handler(async ({ data }): Promise<DestinationSyncRunPage> => {
    const { organizationId } = await requireSession()

    // Over-fetch by one to detect whether an older page exists without a count query.
    const runs = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({
          destinationId: DestinationId(data.destinationId),
          limit: DESTINATION_SYNC_RUNS_PAGE_SIZE + 1,
          ...(data.before
            ? {
                before: {
                  startedAt: new Date(data.before.startedAt),
                  id: DestinationSyncRunId(data.before.id),
                },
              }
            : {}),
        })
      }).pipe(withPostgres(DestinationSyncRunRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    const hasMore = runs.length > DESTINATION_SYNC_RUNS_PAGE_SIZE
    const page = hasMore ? runs.slice(0, DESTINATION_SYNC_RUNS_PAGE_SIZE) : runs
    const last = page[page.length - 1]

    return {
      runs: page.map(toSyncRunRecord),
      nextCursor: hasMore && last ? { startedAt: last.startedAt.toISOString(), id: last.id } : null,
    }
  })

interface DestinationDeliveryPreview {
  /** False when the source has no records yet — the UI shows "No data yet". */
  readonly hasData: boolean
  readonly recordsSampled: number
  /** The mapped events, pretty-printed JSON — rendered verbatim in the form preview. */
  readonly eventsJson: string
}

const previewDestinationDeliverySchema = z.object({
  projectId: z.string(),
  config: destinationConfigSchema,
  source: destinationSourceSchema,
  sourceConfig: destinationSourceConfigSchema,
})

/**
 * "What gets sent" preview: samples the source's latest record and maps it with
 * the candidate per-source config, returning the resulting events. Read-only —
 * no delivery, no upstream call, no cursor move. Powers the form's per-source
 * preview so users can see the exact payload before saving.
 */
export const previewDestinationDelivery = createServerFn({ method: "GET" })
  .inputValidator(previewDestinationDeliverySchema)
  .handler(async ({ data }): Promise<DestinationDeliveryPreview> => {
    const { organizationId } = await requireSession()

    const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
    const buildSpanUrl = (span: SpanDetail) =>
      `${webUrl}/projects/${data.projectId}?traceId=${encodeURIComponent(span.traceId)}&spanId=${encodeURIComponent(span.spanId)}`
    const mapperRegistry: DestinationMapperRegistry = {
      posthog: { spans: createPosthogMapper({ buildSpanUrl }) },
    }

    const result = await Effect.runPromise(
      previewDestinationDeliveryUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        kind: data.config.kind,
        source: data.source,
        sourceConfig: data.sourceConfig,
      }).pipe(
        withClickHouse(
          SpansSourceReadersLive.pipe(Layer.provide(SpanRepositoryLive)),
          getClickhouseClient(),
          organizationId,
        ),
        Effect.provide(Layer.succeed(DestinationMappers, mapperRegistry)),
        withTracing,
      ),
    )

    return {
      hasData: result.hasData,
      recordsSampled: result.recordsSampled,
      eventsJson: JSON.stringify(
        result.events.map((e) => ({ ...e, timestamp: e.timestamp.toISOString() })),
        null,
        2,
      ),
    }
  })
