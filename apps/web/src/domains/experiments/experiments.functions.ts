import {
  createExperimentUseCase,
  deleteExperimentUseCase,
  EXPERIMENT_NAME_MAX_LENGTH,
  type Experiment,
  type ExperimentComparison,
  type ExperimentSearchResult,
  getExperimentBySlugUseCase,
  getExperimentComparisonUseCase,
  listExperimentSummaryMetricsUseCase,
  listExperimentsUseCase,
  searchExperimentsUseCase,
  updateExperimentUseCase,
  VARIANT_NAME_MAX_LENGTH,
  VARIANT_QUERY_MAX_LENGTH,
  variantTimeRangeSchema,
} from "@domain/experiments"
import { ExperimentId, filterSetSchema, ProjectId, SignalId, type SqlClient, TaxonomyClusterId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { VariantMetricsReaderLive } from "@platform/db-clickhouse"
import { ExperimentRepositoryLive, SignalRepositoryLive, TaxonomyClusterRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

const DESCRIPTION_MAX_LENGTH = 2_000

export interface ExperimentVariantRecord {
  readonly id: string
  readonly name: string
  readonly baseline: boolean
  readonly filterSet: Experiment["variants"][number]["filterSet"]
  readonly query: string | null
  readonly timeRange: Experiment["variants"][number]["timeRange"]
}

export interface ExperimentRecord {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly variants: readonly ExperimentVariantRecord[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ExperimentListRow {
  readonly experiment: ExperimentRecord
  readonly sessionsDistinct: number
  readonly usersDistinct: number
}

interface ListExperimentsResultRecord {
  readonly rows: readonly ExperimentListRow[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface ExperimentSearchRecord {
  readonly id: string
  readonly projectSlug: string
  readonly slug: string
  readonly name: string
  readonly variantCount: number
}

export interface ExperimentComparisonRecord {
  readonly experiment: ExperimentRecord
  readonly variants: ExperimentComparison["variants"]
}

const toExperimentRecord = (experiment: Experiment): ExperimentRecord => ({
  id: experiment.id as string,
  slug: experiment.slug,
  name: experiment.name,
  description: experiment.description,
  variants: experiment.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    baseline: variant.baseline,
    filterSet: variant.filterSet,
    query: variant.query,
    timeRange: variant.timeRange,
  })),
  createdAt: experiment.createdAt.toISOString(),
  updatedAt: experiment.updatedAt.toISOString(),
})

const toSearchRecord = (result: ExperimentSearchResult): ExperimentSearchRecord => ({
  id: result.id as string,
  projectSlug: result.projectSlug,
  slug: result.slug,
  name: result.name,
  variantCount: result.variantCount,
})

const variantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(VARIANT_NAME_MAX_LENGTH),
  baseline: z.boolean(),
  filterSet: filterSetSchema,
  query: z.string().max(VARIANT_QUERY_MAX_LENGTH).nullable(),
  timeRange: variantTimeRangeSchema,
})

const listExperimentsInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  searchQuery: z.string().max(500).optional(),
})

export const listExperiments = createServerFn({ method: "GET" })
  .inputValidator(listExperimentsInputSchema)
  .handler(async ({ data, context }): Promise<ListExperimentsResultRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)

    const page = await Effect.runPromise(
      listExperimentsUseCase({
        projectId,
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
      }).pipe(withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId), withTracing),
    )

    const summaries = await Effect.runPromise(
      listExperimentSummaryMetricsUseCase({ experiments: page.items }).pipe(
        withScopedClickHouse(VariantMetricsReaderLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
    const summaryById = new Map(summaries.map((summary) => [summary.experimentId, summary]))

    return {
      rows: page.items.map((experiment) => ({
        experiment: toExperimentRecord(experiment),
        sessionsDistinct: summaryById.get(experiment.id)?.sessionsDistinct ?? 0,
        usersDistinct: summaryById.get(experiment.id)?.usersDistinct ?? 0,
      })),
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
    }
  })

const getExperimentInputSchema = z.object({ projectId: z.string(), slug: z.string() })

export const getExperimentBySlug = createServerFn({ method: "GET" })
  .inputValidator(getExperimentInputSchema)
  .handler(async ({ data, context }): Promise<ExperimentRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const experiment = await Effect.runPromise(
      getExperimentBySlugUseCase({ projectId: ProjectId(data.projectId), slug: data.slug }).pipe(
        withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId),
        withTracing,
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      ),
    )
    return experiment ? toExperimentRecord(experiment) : null
  })

/**
 * Replace the raw ids the reader leaves in `topSignals`/`topBehaviours` labels with the signal /
 * taxonomy-cluster display names (tool labels are already the tool name). Ids are collected across
 * every variant and resolved in one batch each; an id with no matching row keeps its raw label.
 *
 * Labels are cosmetic, so resolution is best-effort: if a lookup fails (e.g. a malformed cluster
 * row that fails entity validation) the comparison is returned with its raw-id labels rather than
 * failing the whole request.
 */
const withResolvedTopListLabels = <E, R>(
  comparison: Effect.Effect<ExperimentComparison, E, R>,
): Effect.Effect<ExperimentComparison, E, R | SqlClient | SignalRepository | TaxonomyClusterRepository> =>
  Effect.gen(function* () {
    const result = yield* comparison

    const signalIds = new Set<string>()
    const clusterIds = new Set<string>()
    for (const variant of result.variants) {
      for (const item of variant.metrics.topSignals) signalIds.add(item.key)
      for (const item of variant.metrics.topBehaviours) clusterIds.add(item.key)
    }

    const resolved = Effect.gen(function* () {
      const signalRepository = yield* SignalRepository
      const clusterRepository = yield* TaxonomyClusterRepository
      const signals = signalIds.size
        ? yield* signalRepository.findByIds({
            projectId: result.experiment.projectId,
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
      // top-signals key is the slug — matching what the signal tools consume.
      const relabelSignals = <T extends { key: string; label: string }>(items: readonly T[]) =>
        items.map((item) => ({
          ...item,
          key: signalSlugs.get(item.key) ?? item.key,
          label: signalNames.get(item.key) ?? item.label,
        }))

      return {
        ...result,
        variants: result.variants.map((variant) => ({
          ...variant,
          metrics: {
            ...variant.metrics,
            topSignals: relabelSignals(variant.metrics.topSignals),
            topBehaviours: relabel(variant.metrics.topBehaviours, clusterNames),
          },
        })),
      }
    })

    return yield* resolved.pipe(Effect.catchCause(() => Effect.succeed(result)))
  })

export const getExperimentComparison = createServerFn({ method: "GET" })
  .inputValidator(getExperimentInputSchema)
  .handler(async ({ data, context }): Promise<ExperimentComparisonRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const comparison = await Effect.runPromise(
      withResolvedTopListLabels(
        getExperimentComparisonUseCase({ projectId: ProjectId(data.projectId), slug: data.slug }),
      ).pipe(
        withScopedPostgres(
          Layer.mergeAll(ExperimentRepositoryLive, SignalRepositoryLive, TaxonomyClusterRepositoryLive),
          getPostgresClient(),
          orgId,
        ),
        withScopedClickHouse(VariantMetricsReaderLive, getClickhouseClient(), orgId),
        withTracing,
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      ),
    )
    if (!comparison) return null
    return { experiment: toExperimentRecord(comparison.experiment), variants: comparison.variants }
  })

const searchExperimentsInputSchema = z.object({
  searchQuery: z.string().max(500).optional(),
  preferProjectId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
})

export const searchExperimentsOrgWide = createServerFn({ method: "GET" })
  .inputValidator(searchExperimentsInputSchema)
  .handler(async ({ data, context }): Promise<readonly ExperimentSearchRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const results = await Effect.runPromise(
      searchExperimentsUseCase({
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        ...(data.preferProjectId ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return results.map(toSearchRecord)
  })

const createExperimentInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(EXPERIMENT_NAME_MAX_LENGTH),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  variants: z.array(variantInputSchema).optional(),
})

export const createExperiment = createServerFn({ method: "POST" })
  .inputValidator(createExperimentInputSchema)
  .handler(async ({ data, context }): Promise<ExperimentRecord> => {
    const orgId = await resolveOrgScope(context)
    const experiment = await Effect.runPromise(
      createExperimentUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        name: data.name,
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.variants !== undefined ? { variants: data.variants } : {}),
      }).pipe(withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toExperimentRecord(experiment)
  })

const updateExperimentInputSchema = z.object({
  experimentId: z.string(),
  name: z.string().min(1).max(EXPERIMENT_NAME_MAX_LENGTH).optional(),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  variants: z.array(variantInputSchema).optional(),
})

export const updateExperiment = createServerFn({ method: "POST" })
  .inputValidator(updateExperimentInputSchema)
  .handler(async ({ data, context }): Promise<ExperimentRecord> => {
    const orgId = await resolveOrgScope(context)
    const experiment = await Effect.runPromise(
      updateExperimentUseCase({
        id: ExperimentId(data.experimentId),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.variants !== undefined ? { variants: data.variants } : {}),
      }).pipe(withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toExperimentRecord(experiment)
  })

export const deleteExperiment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ experimentId: z.string() }))
  .handler(async ({ data, context }): Promise<{ readonly id: string }> => {
    const orgId = await resolveOrgScope(context)
    await Effect.runPromise(
      deleteExperimentUseCase({ id: ExperimentId(data.experimentId) }).pipe(
        withScopedPostgres(ExperimentRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return { id: data.experimentId }
  })
