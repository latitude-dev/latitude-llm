import type { CacheError, OrganizationId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SlackRefreshLockUnavailableError } from "../errors.ts"

export interface SlackRefreshLockInput {
  readonly organizationId: OrganizationId
  readonly ttlSeconds: number
}

export interface SlackRefreshLockRepositoryShape {
  /**
   * Run `effect` while holding a per-workspace Redis lock (keyed
   * `org:${organizationId}:slack:refresh`). Acquires via `SET NX EX`
   * with a unique token and releases via token-comparison delete,
   * exactly like `IssueDiscoveryLockRepository` / `TaxonomyLockRepository`.
   * Single-flights token rotation so concurrent triggers (on-use reads
   * + the scheduled sweep) can never double-rotate the same workspace
   * and clobber each other's single-use refresh token.
   */
  withRefreshLock<A, E, R>(
    input: SlackRefreshLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SlackRefreshLockUnavailableError | CacheError, R>
}

export class SlackRefreshLockRepository extends Context.Service<
  SlackRefreshLockRepository,
  SlackRefreshLockRepositoryShape
>()("@domain/integrations/SlackRefreshLockRepository") {}
