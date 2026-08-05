import {
  cancelImportUseCase,
  createImportUseCase,
  enqueueImportUseCase,
  IMPORT_HARD_MAX_TRACES,
  IMPORT_SOURCE_PAGE_SIZE,
  type ImportCredentials,
  ImportJobNotFoundError,
  ImportJobRepository,
  ImportSourceAdapters,
  importLimitsForPlan,
  importSourceBaseUrl,
  retryImportUseCase,
  testImportConnectionUseCase,
} from "@domain/imports"
import { ProjectRepository } from "@domain/projects"
import { ImportJobId, OrganizationId } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  ImportJobRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import type { OperationContext } from "../core/context.ts"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  ImportCredentialsSchema,
  ImportDetailSchema,
  ImportSchema,
  toImportDetailResponse,
  toImportResponse,
} from "../openapi/entities/import.ts"
import { jsonBody, PROTECTED_SECURITY, ProjectParamsSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const DAY_MS = 24 * 60 * 60 * 1000

const importsPath = "/projects/:projectSlug/imports"

const importEndpoint = defineOperation<OrganizationScopedEnv>(importsPath)

const ImportIdParamsSchema = ProjectParamsSchema.extend({
  importId: z.string().describe("Import id."),
})

const CreateImportBodySchema = z
  .object({
    credentials: ImportCredentialsSchema.describe(
      "Credentials for the platform to import from; `kind` names the platform. Not stored after the import ends.",
    ),
    sourceProjectId: z.string().min(1).describe("Id of the project on the platform to read from."),
    sourceProjectName: z
      .string()
      .min(1)
      .optional()
      .describe("Name of the platform project, shown in Latitude. Defaults to `sourceProjectId`."),
    rangeFrom: z.iso
      .datetime()
      .optional()
      .describe(
        "ISO-8601 start of the range to import. Defaults to 90 days before `rangeTo`, bounded by the plan's retention.",
      ),
    rangeTo: z.iso.datetime().optional().describe("ISO-8601 end of the range to import. Defaults to now."),
    maxTraces: z
      .number()
      .int()
      .min(1)
      .max(IMPORT_HARD_MAX_TRACES)
      .optional()
      .describe(
        `Most traces to import, newest first. Each imported trace bills one credit. Defaults to the maximum, ${IMPORT_HARD_MAX_TRACES.toLocaleString("en-US")}.`,
      ),
    sessionMetadataKey: z
      .string()
      .optional()
      .describe("LangSmith only: run metadata key that groups traces into sessions. Defaults to `thread_id`."),
  })
  .openapi("CreateImportBody")

const RetryImportBodySchema = z
  .object({
    credentials: ImportCredentialsSchema.describe(
      "Platform credentials, required again because they are not stored after an import ends. Must use the same region as the original import.",
    ),
  })
  .openapi("RetryImportBody")

const ListImportsResponseSchema = z
  .object({
    imports: z.array(ImportSchema).describe("The project's imports, newest first."),
  })
  .openapi("ListImportsResponse")

const enqueueImportWith = (ctx: OperationContext) =>
  enqueueImportUseCase({ publish: (payload) => ctx.queuePublisher.publish("imports", "start", payload) })

/** Fails fast on bad credentials, so no import is recorded that could only start failed. */
const testConnectionWith = (ctx: OperationContext, credentials: ImportCredentials) =>
  testImportConnectionUseCase({ source: credentials.kind, credentials }).pipe(
    Effect.provide(Layer.succeed(ImportSourceAdapters, ctx.importSourceAdapters)),
  )

const importLayers = Layer.mergeAll(ProjectRepositoryLive, ImportJobRepositoryLive, OutboxEventWriterLive)

/** Needed wherever the org's plan and remaining usage bound what an import may ask for. */
const planLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OrganizationRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

/** The imports UI is project-scoped, so a job of another project is absent, not forbidden. */
const findProjectImport = (projectSlug: string, importId: string) =>
  Effect.gen(function* () {
    const projectRepo = yield* ProjectRepository
    const project = yield* projectRepo.findBySlug(projectSlug)
    const jobs = yield* ImportJobRepository
    const job = yield* jobs.findById(ImportJobId(importId))
    if (!job || job.projectId !== project.id) {
      return yield* Effect.fail(new ImportJobNotFoundError({ jobId: importId }))
    }
    return job
  })

const listImports = importEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listImports",
    tags: ["Imports"],
    group: "imports",
    sdkMethod: "list",
    summary: "List imports",
    description:
      "Returns the project's imports from other observability platforms, newest first. Excludes the run history — fetch a single import for that.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({ status: 200, schema: ListImportsResponseSchema, description: "List of imports" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const jobs = yield* ImportJobRepository
      const rows = yield* jobs.listByProjectId(project.id)
      return { status: 200, body: { imports: rows.map(toImportResponse) } } as const
    }).pipe(withPostgres(importLayers, ctx.postgresClient, ctx.organization.id), withTracing),
})

const createImport = importEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createImport",
    tags: ["Imports"],
    group: "imports",
    sdkMethod: "create",
    summary: "Create import",
    description:
      "Imports historical traces from another observability platform into the project. The import runs in the background, newest traces first.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateImportBodySchema) },
    responses: typedResponses({ status: 201, schema: ImportSchema, description: "Import created and started" }),
  }),
  access: "write",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const plan = yield* resolveEffectivePlanCached(OrganizationId(ctx.organization.id as string))
      const limits = importLimitsForPlan(plan)

      const rangeTo = body.rangeTo ? new Date(body.rangeTo) : new Date()
      const rangeFrom = body.rangeFrom
        ? new Date(body.rangeFrom)
        : new Date(rangeTo.getTime() - limits.defaultLookbackDays * DAY_MS)

      yield* testConnectionWith(ctx, body.credentials)

      const created = yield* createImportUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        source: body.credentials.kind,
        config: {
          sourceProjectId: body.sourceProjectId,
          sourceProjectName: body.sourceProjectName ?? body.sourceProjectId,
          sourceRegion: body.credentials.region,
          sourceBaseUrl: importSourceBaseUrl(body.credentials),
          sourcePageSize: IMPORT_SOURCE_PAGE_SIZE,
          rangeFrom,
          rangeTo,
          maxTraces: body.maxTraces ?? limits.defaultMaxTraces,
          ...(body.sessionMetadataKey !== undefined ? { sessionMetadataKey: body.sessionMetadataKey } : {}),
        },
        credentials: body.credentials,
        plan,
        createdByUserId: ctx.auth.userId,
      })

      // Enqueued after creation commits, never alongside it: the publish is not part of
      // the transaction, so a worker could otherwise pick the job up before it exists.
      const queued = yield* enqueueImportWith(ctx)({ importJobId: created.id })
      return { status: 201, body: toImportResponse(queued) } as const
    }).pipe(
      withPostgres(Layer.mergeAll(importLayers, planLayers), ctx.postgresClient, ctx.organization.id),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

const getImport = importEndpoint({
  route: createRoute({
    method: "get",
    path: "/{importId}",
    name: "getImport",
    tags: ["Imports"],
    group: "imports",
    sdkMethod: "get",
    summary: "Get import",
    description: "Returns a single import, including its recent run history.",
    security: PROTECTED_SECURITY,
    request: { params: ImportIdParamsSchema },
    responses: typedResponses({ status: 200, schema: ImportDetailSchema, description: "Import" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const job = yield* findProjectImport(input.params.projectSlug, input.params.importId)
      return { status: 200, body: toImportDetailResponse(job) } as const
    }).pipe(withPostgres(importLayers, ctx.postgresClient, ctx.organization.id), withTracing),
})

const cancelImport = importEndpoint({
  route: createRoute({
    method: "post",
    path: "/{importId}/cancel",
    name: "cancelImport",
    tags: ["Imports"],
    group: "imports",
    sdkMethod: "cancel",
    summary: "Cancel import",
    description:
      "Cancels an import that has not finished. Traces already imported are kept, and the import can be retried later.",
    security: PROTECTED_SECURITY,
    request: { params: ImportIdParamsSchema },
    responses: typedResponses({ status: 200, schema: ImportSchema, description: "Import cancelled" }),
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const job = yield* findProjectImport(input.params.projectSlug, input.params.importId)
      const cancelled = yield* cancelImportUseCase({ importJobId: job.id })
      return { status: 200, body: toImportResponse(cancelled) } as const
    }).pipe(withPostgres(importLayers, ctx.postgresClient, ctx.organization.id), withTracing),
})

const retryImport = importEndpoint({
  route: createRoute({
    method: "post",
    path: "/{importId}/retry",
    name: "retryImport",
    tags: ["Imports"],
    group: "imports",
    sdkMethod: "retry",
    summary: "Retry import",
    description:
      "Retries a failed, cancelled, or capped import from where it stopped, as a new import that runs in the background. Credentials must be provided again and match the original's region.",
    security: PROTECTED_SECURITY,
    request: { params: ImportIdParamsSchema, body: jsonBody(RetryImportBodySchema) },
    responses: typedResponses({ status: 201, schema: ImportSchema, description: "Retry created and started" }),
  }),
  access: "write",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const job = yield* findProjectImport(input.params.projectSlug, input.params.importId)
      const plan = yield* resolveEffectivePlanCached(OrganizationId(ctx.organization.id as string))

      yield* testConnectionWith(ctx, input.body.credentials)

      const retried = yield* retryImportUseCase({
        importJobId: job.id,
        credentials: input.body.credentials,
        plan,
      })

      // Same ordering as `createImport`: the retry row commits, then it is published.
      const queued = yield* enqueueImportWith(ctx)({ importJobId: retried.id })
      return { status: 201, body: toImportResponse(queued) } as const
    }).pipe(
      withPostgres(Layer.mergeAll(importLayers, planLayers), ctx.postgresClient, ctx.organization.id),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

export const importsModule: OperationModule = {
  path: importsPath,
  operations: [listImports, createImport, getImport, cancelImport, retryImport],
}
