import { DistributedLockRepository, type OrganizationId, type ProjectId, type TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TaxonomyClusterLockUnavailableError, TaxonomyGardenLockUnavailableError } from "./errors.ts"

export const taxonomyClusterLockKey = (input: {
  readonly organizationId: OrganizationId | string
  readonly clusterId: TaxonomyClusterId | string
}) => `org:${input.organizationId}:taxonomy:cluster:${input.clusterId}`

export const taxonomyGardenLockKey = (input: {
  readonly organizationId: OrganizationId | string
  readonly projectId: ProjectId | string
}) => `org:${input.organizationId}:taxonomy:garden:${input.projectId}`

export const withTaxonomyClusterLock = <A, E, R>(
  input: {
    readonly organizationId: OrganizationId | string
    readonly clusterId: TaxonomyClusterId | string
    readonly ttlSeconds: number
  },
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const locks = yield* DistributedLockRepository
    return yield* locks
      .withLock({ key: taxonomyClusterLockKey(input), ttlSeconds: input.ttlSeconds }, effect)
      .pipe(
        Effect.catchTag("DistributedLockUnavailableError", () =>
          Effect.fail(new TaxonomyClusterLockUnavailableError({ clusterId: String(input.clusterId) })),
        ),
      )
  })

export const withTaxonomyGardenLock = <A, E, R>(
  input: {
    readonly organizationId: OrganizationId | string
    readonly projectId: ProjectId | string
    readonly ttlSeconds: number
  },
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const locks = yield* DistributedLockRepository
    return yield* locks
      .withLock({ key: taxonomyGardenLockKey(input), ttlSeconds: input.ttlSeconds }, effect)
      .pipe(
        Effect.catchTag("DistributedLockUnavailableError", () =>
          Effect.fail(new TaxonomyGardenLockUnavailableError({ projectId: String(input.projectId) })),
        ),
      )
  })
