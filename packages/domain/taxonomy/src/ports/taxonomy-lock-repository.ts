import type { CacheError, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyClusterLockUnavailableError, TaxonomyGardenLockUnavailableError } from "../errors.ts"

export interface TaxonomyClusterLockInput {
  readonly organizationId: OrganizationId
  readonly clusterId: TaxonomyClusterId
  readonly ttlSeconds: number
}

export interface TaxonomyGardenLockInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly ttlSeconds: number
}

export interface TaxonomyLockRepositoryShape {
  /**
   * Run `effect` while holding a per-cluster Redis lock. Acquires via
   * `SET NX EX` with a unique token and releases via token-comparison
   * delete, exactly like `IssueDiscoveryLockRepository`.
   */
  withClusterLock<A, E, R>(
    input: TaxonomyClusterLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | TaxonomyClusterLockUnavailableError | CacheError, R>
  withGardenLock<A, E, R>(
    input: TaxonomyGardenLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | TaxonomyGardenLockUnavailableError | CacheError, R>
}

export class TaxonomyLockRepository extends Context.Service<TaxonomyLockRepository, TaxonomyLockRepositoryShape>()(
  "@domain/taxonomy/TaxonomyLockRepository",
) {}
