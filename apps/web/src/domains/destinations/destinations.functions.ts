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
  type Destination,
  type DestinationConfig,
  type DestinationDelivererRegistry,
  DestinationDeliverers,
  DestinationRepository,
  type DestinationStatus,
  type DestinationSyncRun,
  DestinationSyncRunRepository,
  type DestinationSyncRunStatus,
  deleteDestinationUseCase,
  destinationConfigSchema,
  destinationCredentialsSchema,
  pauseDestinationUseCase,
  previewCredentials,
  resumeDestinationUseCase,
  type TestDestinationConnectionResult,
  testDestinationConnectionUseCase,
  updateDestinationUseCase,
} from "@domain/destinations"
import { DestinationId, DestinationSyncRunId, ProjectId } from "@domain/shared"
import { createPosthogDeliverer } from "@platform/data-destinations"
import {
  DestinationRepositoryLive,
  DestinationSyncRunRepositoryLive,
  OrganizationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

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
  readonly lastRunAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (destination: Destination): DestinationRecord => ({
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
  lastRunAt: destination.lastRunAt?.toISOString() ?? null,
  createdAt: destination.createdAt.toISOString(),
  updatedAt: destination.updatedAt.toISOString(),
})

export const listDestinations = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly DestinationRecord[]> => {
    const { organizationId } = await requireSession()

    const destinations = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DestinationRepository
        return yield* repo.listByProjectId(ProjectId(data.projectId))
      }).pipe(withPostgres(DestinationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return destinations.map(toRecord)
  })

const createDestinationSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(256),
  config: destinationConfigSchema,
  credentials: destinationCredentialsSchema,
})

export const createDestination = createServerFn({ method: "POST" })
  .inputValidator(createDestinationSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId, userId } = await requireSession()

    const destination = await Effect.runPromise(
      createDestinationUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        name: data.name,
        config: data.config,
        credentials: data.credentials,
        createdByUserId: userId,
      }).pipe(
        withPostgres(
          Layer.mergeAll(OrganizationRepositoryLive, DestinationRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )

    return toRecord(destination)
  })

const updateDestinationSchema = z.object({
  projectId: z.string(),
  destinationId: z.string(),
  name: z.string().min(1).max(256).optional(),
  config: destinationConfigSchema.optional(),
  credentials: destinationCredentialsSchema.optional(),
})

export const updateDestination = createServerFn({ method: "POST" })
  .inputValidator(updateDestinationSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const destination = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        destinationId: DestinationId(data.destinationId),
        name: data.name,
        config: data.config,
        credentials: data.credentials,
      }).pipe(withPostgres(DestinationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return toRecord(destination)
  })

const destinationActionSchema = z.object({
  projectId: z.string(),
  destinationId: z.string(),
})

export const pauseDestination = createServerFn({ method: "POST" })
  .inputValidator(destinationActionSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const destination = await Effect.runPromise(
      pauseDestinationUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        destinationId: DestinationId(data.destinationId),
      }).pipe(withPostgres(DestinationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return toRecord(destination)
  })

export const resumeDestination = createServerFn({ method: "POST" })
  .inputValidator(destinationActionSchema)
  .handler(async ({ data }): Promise<DestinationRecord> => {
    const { organizationId } = await requireSession()

    const destination = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId,
        projectId: ProjectId(data.projectId),
        destinationId: DestinationId(data.destinationId),
      }).pipe(withPostgres(DestinationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return toRecord(destination)
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
          Layer.mergeAll(DestinationRepositoryLive, DestinationSyncRunRepositoryLive),
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
  readonly status: DestinationSyncRunStatus
  readonly spansRead: number
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
  status: run.status,
  spansRead: run.spansRead,
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
