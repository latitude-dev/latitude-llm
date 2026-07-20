import type {
  ChSqlClient,
  FilterSet,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ValidationError,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ResolvedRange, VariantMetrics } from "../entities/variant-metrics.ts"

/**
 * A resolved variant population: the sessions filter set + optional (best-effort) search query
 * over an absolute time window. Child-entity metrics (traces/tools/signals/behaviours/users) are
 * scoped to the sessions this selects.
 */
export interface VariantPopulation {
  readonly filterSet: FilterSet
  readonly query: string | null
  readonly range: ResolvedRange
}

export interface ComputeVariantMetricsInput extends VariantPopulation {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface ComputeSummaryMetricsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** All of one experiment's variant populations; summary counts are distinct unions across them. */
  readonly populations: readonly VariantPopulation[]
}

export interface ExperimentSummaryCounts {
  readonly sessionsDistinct: number
  readonly usersDistinct: number
}

/**
 * Reads population-scoped comparison analytics from ClickHouse. Each method resolves the population
 * of matching sessions (from the filter set + range, plus the lexical part of the search query) and
 * aggregates every comparable metric scoped to that population. Semantic search components are
 * best-effort — the population is approximate when a query has a semantic part.
 */
export interface VariantMetricsReaderShape {
  /** The full per-entity metric bundle for one variant's population. */
  computeVariantMetrics(
    input: ComputeVariantMetricsInput,
  ): Effect.Effect<VariantMetrics, RepositoryError | ValidationError, ChSqlClient>
  /** Distinct sessions and distinct users over the union of an experiment's variant populations (list row). */
  computeSummaryMetrics(
    input: ComputeSummaryMetricsInput,
  ): Effect.Effect<ExperimentSummaryCounts, RepositoryError | ValidationError, ChSqlClient>
}

export class VariantMetricsReader extends Context.Service<VariantMetricsReader, VariantMetricsReaderShape>()(
  "@domain/experiments/VariantMetricsReader",
) {}
