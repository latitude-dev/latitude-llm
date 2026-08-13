import {
  ActiveImportConflictError,
  cancelImportUseCase,
  createImportUseCase,
  enqueueImportUseCase,
  type ImportJob,
  ImportJobNotEnqueueableError,
  ImportJobNotFoundError,
  ImportJobNotRetryableError,
  ImportJobRepository,
  ImportRegionMismatchError,
  type ImportRun,
  ImportSourceAdapters,
  ImportUsageExhaustedError,
  importConfigSchema,
  importCredentialsSchema,
  importLimitsForPlan,
  importPreviewConfigSchema,
  importSourceBaseUrl,
  importSourceSchema,
  listImportSourceProjectsUseCase,
  previewCredentials,
  previewImportUseCase,
  retryImportUseCase,
  testImportConnectionUseCase,
} from "@domain/imports"
import type { QueuePublisherShape } from "@domain/queue"
import { ImportJobId, OrganizationId, type OrganizationId as OrganizationIdType, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  ImportJobRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  redactedImportJob,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createImportAdapterRegistry } from "@platform/import-sources"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"

const postgresLayers = Layer.mergeAll(ImportJobRepositoryLive, OutboxEventWriterLive)

/** Needed wherever the org's plan and remaining usage bound what an import may ask for. */
const planLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OrganizationRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

const adaptersLayer = Layer.succeed(ImportSourceAdapters, createImportAdapterRegistry())

const enqueueImportWith = (publisher: QueuePublisherShape) =>
  enqueueImportUseCase({ publish: (payload) => publisher.publish("imports", "start", payload) })

const activeImportMessage = (error: ActiveImportConflictError, projectId?: string): string => {
  const where = projectId !== undefined && error.activeProjectId !== projectId ? " in another project" : ""
  return `An import of ${error.activeSourceProjectName} is already running${where}. Only one import can run at a time in an organization.`
}

/**
 * Tagged errors keep their data in fields and leave `message` empty, and `message` is the only field
 * that survives the server-function boundary, so an unmapped one reaches the client as a blank string
 * and renders as an empty error. Every failure the write paths raise is given a sentence here.
 */
const toUserFacingError = (error: unknown, projectId?: string): unknown => {
  if (error instanceof ActiveImportConflictError) return new Error(activeImportMessage(error, projectId))
  if (error instanceof ImportUsageExhaustedError) {
    return new Error(
      `This organization has no usage left this billing period, so there is nothing to import into. Usage resets on ${error.periodEnd.toISOString().slice(0, 10)}.`,
    )
  }
  if (error instanceof ImportRegionMismatchError) {
    return new Error(
      `These keys are for the ${error.received} region, but this import ran against ${error.expected}. Retrying reuses the original region, so use keys from ${error.expected} or start a new import.`,
    )
  }
  if (error instanceof ImportJobNotRetryableError) {
    return new Error(`This import is ${error.status}, so there is nothing to resume.`)
  }
  if (error instanceof ImportJobNotFoundError) return new Error("This import no longer exists.")
  if (error instanceof ImportJobNotEnqueueableError) {
    return new Error("This import could not be queued because its status changed. Reload the page and try again.")
  }
  return error
}

export interface ImportRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly source: ImportJob["source"]
  readonly status: ImportJob["status"]
  readonly config: {
    readonly sourceProjectId: string
    readonly sourceProjectName: string
    readonly sourceRegion: string
    readonly sourceBaseUrl: string
    readonly rangeFrom: string
    readonly rangeTo: string
    readonly maxTraces: number
    readonly sourcePageSize: number
    readonly sessionMetadataKey?: string
  }
  readonly credentialsPreview: string | null
  readonly stats: ImportJob["stats"]
  readonly runs: readonly ImportRunRecord[]
  readonly error: string | null
  readonly cancelledAt: string | null
  readonly startedAt: string | null
  readonly finishedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ImportRunRecord {
  readonly status: ImportRun["status"]
  readonly stats: ImportRun["stats"]
  readonly error: string | null
  readonly startedAt: string
  readonly finishedAt: string
}

const toRecord = (job: ImportJob): ImportRecord => ({
  id: job.id,
  organizationId: job.organizationId,
  projectId: job.projectId,
  source: job.source,
  status: job.status,
  config: {
    sourceProjectId: job.config.sourceProjectId,
    sourceProjectName: job.config.sourceProjectName,
    sourceRegion: job.config.sourceRegion,
    sourceBaseUrl: job.config.sourceBaseUrl,
    rangeFrom: job.config.rangeFrom.toISOString(),
    rangeTo: job.config.rangeTo.toISOString(),
    maxTraces: job.config.maxTraces,
    sourcePageSize: job.config.sourcePageSize,
    ...(job.config.sessionMetadataKey !== undefined ? { sessionMetadataKey: job.config.sessionMetadataKey } : {}),
  },
  credentialsPreview: job.credentials ? previewCredentials(job.credentials) : null,
  stats: job.stats,
  runs: job.runs.map(toRunRecord),
  error: job.error,
  cancelledAt: job.cancelledAt?.toISOString() ?? null,
  startedAt: job.startedAt?.toISOString() ?? null,
  finishedAt: job.finishedAt?.toISOString() ?? null,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
})

const toRunRecord = (run: ImportRun): ImportRunRecord => ({
  status: run.status,
  stats: run.stats,
  error: run.error,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt.toISOString(),
})

export interface ImportLimitsRecord {
  readonly planSlug: "free" | "pro" | "enterprise"
  readonly retentionDays: number
  /** When this period's usage resets, which is when an import paused on usage can carry on. */
  readonly periodEnd: string
  readonly minLookbackDays: number
  readonly maxLookbackDays: number
  readonly defaultLookbackDays: number
  readonly maxTraces: number
  readonly defaultMaxTraces: number
  readonly lookbackLimitedByRetention: boolean
}

const loadImportLimits = (organizationId: OrganizationIdType) =>
  Effect.gen(function* () {
    const plan = yield* resolveEffectivePlanCached(organizationId)
    const limits = importLimitsForPlan(plan)

    return {
      planSlug: limits.planSlug,
      retentionDays: limits.retentionDays,
      periodEnd: limits.periodEnd.toISOString(),
      minLookbackDays: limits.minLookbackDays,
      maxLookbackDays: limits.maxLookbackDays,
      defaultLookbackDays: limits.defaultLookbackDays,
      maxTraces: limits.maxTraces,
      defaultMaxTraces: limits.defaultMaxTraces,
      lookbackLimitedByRetention: limits.lookbackLimitedByRetention,
    } satisfies ImportLimitsRecord
  })

/** Drives the wizard's defaults and its "what to expect" panel from the same numbers the backend enforces. */
export const getImportLimits = createServerFn({ method: "GET" }).handler(async (): Promise<ImportLimitsRecord> => {
  const { organizationId } = await requireSession()

  return Effect.runPromise(
    loadImportLimits(OrganizationId(organizationId)).pipe(
      withPostgres(planLayers, getPostgresClient(), organizationId),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
    ),
  )
})

export const importsQueryKey = (projectId: string) => ["imports", projectId] as const

export const listImports = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly ImportRecord[]> => {
    const { organizationId } = await requireSession()

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ImportJobRepository
        const jobs = yield* repo.listByProjectId(ProjectId(data.projectId))
        return jobs.map((job) => toRecord(redactedImportJob(job)))
      }).pipe(withPostgres(postgresLayers, getPostgresClient(), organizationId), withTracing),
    )
  })

export const testImportConnection = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      source: importSourceSchema,
      credentials: importCredentialsSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { organizationId } = await requireSession()

    await Effect.runPromise(
      testImportConnectionUseCase(data).pipe(
        Effect.provide(adaptersLayer),
        withPostgres(postgresLayers, getPostgresClient(), organizationId),
        withTracing,
      ),
    )

    return { ok: true }
  })

export const listImportSourceProjects = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      source: importSourceSchema,
      credentials: importCredentialsSchema,
      cursor: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()

    return Effect.runPromise(
      listImportSourceProjectsUseCase({
        source: data.source,
        credentials: data.credentials,
        ...(data.cursor !== undefined ? { cursor: data.cursor } : {}),
      }).pipe(
        Effect.provide(adaptersLayer),
        withPostgres(postgresLayers, getPostgresClient(), organizationId),
        withTracing,
      ),
    )
  })

const previewInputSchema = z.object({
  source: importSourceSchema,
  credentials: importCredentialsSchema,
  sourceProjectId: z.string(),
  config: z.object({
    rangeFrom: z.string().datetime(),
    rangeTo: z.string().datetime(),
    maxTraces: z.number().int().min(1),
    sessionMetadataKey: z.string().optional(),
  }),
})

export const previewImport = createServerFn({ method: "POST" })
  .inputValidator(previewInputSchema)
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()

    return Effect.runPromise(
      previewImportUseCase({
        source: data.source,
        credentials: data.credentials,
        sourceProjectId: data.sourceProjectId,
        config: importPreviewConfigSchema.parse({
          ...data.config,
          rangeFrom: new Date(data.config.rangeFrom),
          rangeTo: new Date(data.config.rangeTo),
        }),
      }).pipe(
        Effect.provide(adaptersLayer),
        withPostgres(postgresLayers, getPostgresClient(), organizationId),
        withTracing,
      ),
    )
  })

const createImportSchema = z.object({
  projectId: z.string(),
  source: importSourceSchema,
  credentials: importCredentialsSchema,
  config: z.object({
    sourceProjectId: z.string().min(1),
    sourceProjectName: z.string().min(1),
    rangeFrom: z.string().datetime(),
    rangeTo: z.string().datetime(),
    maxTraces: z.number().int().min(1),
    sourcePageSize: z.number().int().min(1),
    sessionMetadataKey: z.string().optional(),
  }),
})

export const createImport = createServerFn({ method: "POST" })
  .inputValidator(createImportSchema)
  .handler(async ({ data }): Promise<ImportRecord> => {
    const { organizationId, userId } = await requireSession()
    const enqueueImport = enqueueImportWith(await getQueuePublisher())

    try {
      const job = await Effect.runPromise(
        Effect.gen(function* () {
          const plan = yield* resolveEffectivePlanCached(OrganizationId(organizationId))

          const created = yield* createImportUseCase({
            organizationId: OrganizationId(organizationId),
            projectId: ProjectId(data.projectId),
            source: data.source,
            config: importConfigSchema.parse({
              ...data.config,
              sourceRegion: data.credentials.region,
              sourceBaseUrl: importSourceBaseUrl(data.credentials),
              rangeFrom: new Date(data.config.rangeFrom),
              rangeTo: new Date(data.config.rangeTo),
            }),
            credentials: data.credentials,
            plan,
            createdByUserId: userId,
          })

          // Enqueued after creation commits, never alongside it: the publish is not part of
          // the transaction, so a worker could otherwise pick the job up before it exists.
          return yield* enqueueImport({ importJobId: created.id })
        }).pipe(
          withPostgres(Layer.mergeAll(postgresLayers, planLayers), getPostgresClient(), organizationId),
          Effect.provide(RedisCacheStoreLive(getRedisClient())),
          withTracing,
        ),
      )

      return toRecord(redactedImportJob(job))
    } catch (error) {
      throw toUserFacingError(error, data.projectId)
    }
  })

export const cancelImport = createServerFn({ method: "POST" })
  .inputValidator(z.object({ importJobId: z.string() }))
  .handler(async ({ data }): Promise<ImportRecord> => {
    const { organizationId } = await requireSession()

    const job = await Effect.runPromise(
      cancelImportUseCase({ importJobId: ImportJobId(data.importJobId) }).pipe(
        withPostgres(postgresLayers, getPostgresClient(), organizationId),
        withTracing,
      ),
    )

    return toRecord(redactedImportJob(job))
  })

export const retryImport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      importJobId: z.string(),
      credentials: importCredentialsSchema,
    }),
  )
  .handler(async ({ data }): Promise<ImportRecord> => {
    const { organizationId } = await requireSession()
    const enqueueImport = enqueueImportWith(await getQueuePublisher())

    try {
      const job = await Effect.runPromise(
        Effect.gen(function* () {
          const plan = yield* resolveEffectivePlanCached(OrganizationId(organizationId))
          const retried = yield* retryImportUseCase({
            importJobId: ImportJobId(data.importJobId),
            credentials: data.credentials,
            plan,
          })

          // Same ordering as `createImport`: the retry row commits, then it is published.
          return yield* enqueueImport({ importJobId: retried.id })
        }).pipe(
          withPostgres(Layer.mergeAll(postgresLayers, planLayers), getPostgresClient(), organizationId),
          Effect.provide(RedisCacheStoreLive(getRedisClient())),
          withTracing,
        ),
      )

      return toRecord(redactedImportJob(job))
    } catch (error) {
      throw toUserFacingError(error)
    }
  })
