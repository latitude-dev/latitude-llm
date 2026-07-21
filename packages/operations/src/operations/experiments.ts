import {
  type CreateExperimentVariantInput,
  createExperimentUseCase,
  deleteExperimentUseCase,
  EXPERIMENT_NAME_MAX_LENGTH,
  type ExperimentComparison,
  getExperimentBySlugUseCase,
  getExperimentComparisonUseCase,
  listExperimentSummaryMetricsUseCase,
  listExperimentsUseCase,
  MAX_VARIANTS_PER_EXPERIMENT,
  updateExperimentUseCase,
  VARIANT_NAME_MAX_LENGTH,
  VARIANT_QUERY_MAX_LENGTH,
} from "@domain/experiments"
import { ProjectRepository } from "@domain/projects"
import { BadRequestError, OrganizationId, SignalId, TaxonomyClusterId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { createRoute, z } from "@hono/zod-openapi"
import { VariantMetricsReaderLive, withClickHouse } from "@platform/db-clickhouse"
import {
  ExperimentRepositoryLive,
  ProjectRepositoryLive,
  SignalRepositoryLive,
  TaxonomyClusterRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  decodeExperimentCursor,
  ExperimentComparisonSchema,
  ExperimentListItemSchema,
  ExperimentSchema,
  encodeExperimentCursor,
  toExperimentComparisonResponse,
  toExperimentResponse,
} from "../openapi/entities/experiment.ts"
import { Paginated } from "../openapi/pagination.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const DESCRIPTION_MAX_LENGTH = 2000

const ExperimentSlugParamsSchema = ProjectParamsSchema.extend({
  experimentSlug: z.string().describe("Experiment slug (human-readable identifier within the project)."),
})

const VariantTimeRangeInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("relative"),
      seconds: z.number().int().positive().describe("Length of the live window in seconds."),
    }),
    z.object({
      type: z.literal("absolute"),
      fromIso: z.string().describe("ISO-8601 start of the window (inclusive)."),
      toIso: z.string().describe("ISO-8601 end of the window (inclusive)."),
    }),
  ])
  .describe("Relative (last N seconds) or absolute window.")

const VariantInputSchema = z.object({
  id: z.string().optional().describe("Existing variant id to preserve. Omit to mint a new variant."),
  name: z.string().min(1).max(VARIANT_NAME_MAX_LENGTH).describe("Variant name. Unique within the experiment."),
  baseline: z.boolean().describe("`true` for the baseline variant. Exactly one variant must be the baseline."),
  filterSet: FilterSetSchema.describe("Session filters selecting this variant's population."),
  query: z.string().max(VARIANT_QUERY_MAX_LENGTH).nullable().describe("Free-text / semantic search, or `null`."),
  timeRange: VariantTimeRangeInputSchema.nullable().describe(
    "Time window, or `null` for the default last-30-days window.",
  ),
})

const CreateExperimentBodySchema = z
  .object({
    name: z.string().min(1).max(EXPERIMENT_NAME_MAX_LENGTH).describe("Human-readable name. Used to derive the slug."),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional().describe("Optional free-form description."),
    variants: z
      .array(VariantInputSchema)
      .max(MAX_VARIANTS_PER_EXPERIMENT)
      .optional()
      .describe(
        "Variant definitions. Omit to seed two default variants (`Variant A` baseline + `Variant B`); pass `[]` to create an empty experiment.",
      ),
  })
  .openapi("CreateExperimentBody")

const UpdateExperimentBodySchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(EXPERIMENT_NAME_MAX_LENGTH)
      .optional()
      .describe("New name. Renaming may regenerate the slug — re-read the response or rely on `id`."),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional().describe("New description."),
    variants: z
      .array(VariantInputSchema)
      .max(MAX_VARIANTS_PER_EXPERIMENT)
      .optional()
      .describe("Full replacement of the variants array. Each variant carries its own `baseline` flag."),
  })
  .openapi("UpdateExperimentBody")

const ListExperimentsQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Page size. Defaults to 50; max 100."),
  search: z.string().optional().describe("Filter by name (case-insensitive substring)."),
})

const PaginatedExperimentsSchema = Paginated(ExperimentListItemSchema, "PaginatedExperiments")

const experimentsPath = "/projects/:projectSlug/experiments"

const experimentEndpoint = defineOperation<OrganizationScopedEnv>(experimentsPath)

/**
 * Best-effort resolution of the reader's raw signal/cluster ids to display names in the top-N lists.
 * Cosmetic, so any lookup failure returns the comparison with its raw-id labels rather than failing.
 */
const resolveComparisonLabels = (comparison: ExperimentComparison) =>
  Effect.gen(function* () {
    const signalIds = new Set<string>()
    const clusterIds = new Set<string>()
    for (const variant of comparison.variants) {
      for (const item of variant.metrics.topSignals) signalIds.add(item.key)
      for (const item of variant.metrics.topBehaviours) clusterIds.add(item.key)
    }
    if (signalIds.size === 0 && clusterIds.size === 0) return comparison

    const signalRepository = yield* SignalRepository
    const clusterRepository = yield* TaxonomyClusterRepository
    const signals = signalIds.size
      ? yield* signalRepository.findByIds({
          projectId: comparison.experiment.projectId,
          signalIds: [...signalIds].map(SignalId),
        })
      : []
    const clusters = clusterIds.size ? yield* clusterRepository.listByIds([...clusterIds].map(TaxonomyClusterId)) : []

    const signalNames = new Map(signals.map((signal) => [signal.id as string, signal.name]))
    const signalSlugs = new Map(signals.map((signal) => [signal.id as string, signal.slug]))
    const clusterNames = new Map(clusters.map((cluster) => [cluster.id as string, cluster.name]))
    const relabel = <T extends { key: string; label: string }>(items: readonly T[], names: Map<string, string>) =>
      items.map((item) => ({ ...item, label: names.get(item.key) ?? item.label }))
    // Signals are addressed by slug across the public surface (API/MCP/URLs), so the
    // top-signals key is the slug — an agent can feed it straight into the signal tools.
    const relabelSignals = <T extends { key: string; label: string }>(items: readonly T[]) =>
      items.map((item) => ({
        ...item,
        key: signalSlugs.get(item.key) ?? item.key,
        label: signalNames.get(item.key) ?? item.label,
      }))

    return {
      ...comparison,
      variants: comparison.variants.map((variant) => ({
        ...variant,
        metrics: {
          ...variant.metrics,
          topSignals: relabelSignals(variant.metrics.topSignals),
          topBehaviours: relabel(variant.metrics.topBehaviours, clusterNames),
        },
      })),
    }
  }).pipe(Effect.catchCause(() => Effect.succeed(comparison)))

const listExperiments = experimentEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listExperiments",
    tags: ["Experiments"],
    group: "experiments",
    sdkMethod: "list",
    summary: "List experiments",
    description:
      "Returns the project's experiments with cheap summary metrics (variant count, distinct sessions and users across all variant populations). Excludes per-variant comparison metrics — fetch a single experiment for those.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListExperimentsQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedExperimentsSchema, description: "Page of experiments" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const query = input.query

      let offset = 0
      if (query.cursor) {
        const decoded = decodeExperimentCursor(query.cursor)
        if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        offset = decoded.offset
      }
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const page = yield* listExperimentsUseCase({
        projectId: project.id,
        limit: query.limit,
        offset,
        ...(query.search ? { searchQuery: query.search } : {}),
      })
      const summaries = yield* listExperimentSummaryMetricsUseCase({ experiments: page.items })
      const summaryById = new Map(summaries.map((summary) => [summary.experimentId, summary]))
      const items = page.items.map((experiment) => ({
        ...toExperimentResponse(experiment),
        variantCount: experiment.variants.length,
        sessionsDistinct: summaryById.get(experiment.id as string)?.sessionsDistinct ?? 0,
        usersDistinct: summaryById.get(experiment.id as string)?.usersDistinct ?? 0,
      }))
      const nextCursor = page.hasMore ? encodeExperimentCursor(page.offset + page.items.length) : null
      return { status: 200, body: { items, nextCursor, hasMore: page.hasMore } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ExperimentRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(VariantMetricsReaderLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const createExperiment = experimentEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createExperiment",
    tags: ["Experiments"],
    group: "experiments",
    sdkMethod: "create",
    summary: "Create experiment",
    description: "Creates an experiment. The slug is derived from `name`. Omit `variants` to seed two defaults.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateExperimentBodySchema) },
    responses: typedResponses({ status: 201, schema: ExperimentSchema, description: "Experiment created" }),
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const experiment = yield* createExperimentUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.variants !== undefined ? { variants: body.variants as readonly CreateExperimentVariantInput[] } : {}),
      })
      return { status: 201, body: toExperimentResponse(experiment) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ExperimentRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getExperiment = experimentEndpoint({
  route: createRoute({
    method: "get",
    path: "/{experimentSlug}",
    name: "getExperiment",
    tags: ["Experiments"],
    group: "experiments",
    sdkMethod: "get",
    summary: "Get experiment",
    description:
      "Returns a single experiment plus its comparison: per-variant metrics, deltas vs the baseline, and population-deviation flags.",
    security: PROTECTED_SECURITY,
    request: { params: ExperimentSlugParamsSchema },
    responses: typedResponses({
      status: 200,
      schema: ExperimentComparisonSchema,
      description: "Experiment comparison",
    }),
  }),
  access: "read-only",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, experimentSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const comparison = yield* getExperimentComparisonUseCase({ projectId: project.id, slug: experimentSlug })
      const resolved = yield* resolveComparisonLabels(comparison)
      return { status: 200, body: toExperimentComparisonResponse(resolved) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(
          ProjectRepositoryLive,
          ExperimentRepositoryLive,
          SignalRepositoryLive,
          TaxonomyClusterRepositoryLive,
        ),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(VariantMetricsReaderLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const updateExperiment = experimentEndpoint({
  route: createRoute({
    method: "put",
    path: "/{experimentSlug}",
    name: "updateExperiment",
    tags: ["Experiments"],
    group: "experiments",
    sdkMethod: "update",
    summary: "Update experiment",
    description:
      "Replaces an experiment's mutable fields. `variants`, when supplied, fully replaces the array (each variant carries its own `baseline` flag). Renaming may regenerate the slug.",
    security: PROTECTED_SECURITY,
    request: { params: ExperimentSlugParamsSchema, body: jsonBody(UpdateExperimentBodySchema) },
    responses: typedResponses({ status: 200, schema: ExperimentSchema, description: "Updated experiment" }),
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, experimentSlug } = input.params
      const body = input.body
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getExperimentBySlugUseCase({ projectId: project.id, slug: experimentSlug })
      const experiment = yield* updateExperimentUseCase({
        id: current.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.variants !== undefined ? { variants: body.variants as readonly CreateExperimentVariantInput[] } : {}),
      })
      return { status: 200, body: toExperimentResponse(experiment) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ExperimentRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const deleteExperiment = experimentEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{experimentSlug}",
    name: "deleteExperiment",
    tags: ["Experiments"],
    group: "experiments",
    sdkMethod: "delete",
    summary: "Delete experiment",
    description: "Deletes an experiment. Its slug becomes reusable.",
    security: PROTECTED_SECURITY,
    request: { params: ExperimentSlugParamsSchema },
    responses: openApiNoContentResponses({ description: "Experiment deleted" }),
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, experimentSlug } = input.params
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const current = yield* getExperimentBySlugUseCase({ projectId: project.id, slug: experimentSlug })
      yield* deleteExperimentUseCase({ id: current.id })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ExperimentRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const experimentsModule: OperationModule = {
  path: experimentsPath,
  operations: [listExperiments, createExperiment, getExperiment, updateExperiment, deleteExperiment],
}
