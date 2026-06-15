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
  DestinationRepository,
  type DestinationStatus,
  deleteDestinationUseCase,
  destinationConfigSchema,
  destinationCredentialsSchema,
  pauseDestinationUseCase,
  resumeDestinationUseCase,
  updateDestinationUseCase,
} from "@domain/destinations"
import { DestinationId, ForbiddenError, ProjectId } from "@domain/shared"
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

/** Outcome of a pre-save connection probe. `ok=false` carries a sanitized reason. */
export interface DestinationConnectionTestResult {
  readonly ok: boolean
  readonly message: string | null
}

const testDestinationConnectionSchema = z.object({
  config: destinationConfigSchema,
  credentials: destinationCredentialsSchema,
})

export const testDestinationConnection = createServerFn({ method: "POST" })
  .inputValidator(testDestinationConnectionSchema)
  .handler(async (): Promise<DestinationConnectionTestResult> => {
    await requireSession()

    // TODO(LAT-674): passthrough to `testDestinationConnectionUseCase` (P2-1) once merged — no canary logic here.
    throw new ForbiddenError({ message: "Destination connection testing is not available yet" })
  })
