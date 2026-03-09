import type { GrantId, NotFoundError, RepositoryError, SubscriptionId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Grant, GrantType } from "../entities/grant.ts"

export class GrantRepository extends ServiceMap.Service<
  GrantRepository,
  {
    findById(id: GrantId): Effect.Effect<Grant, NotFoundError | RepositoryError>
    findAll(): Effect.Effect<readonly Grant[], RepositoryError>
    findBySubscriptionId(subscriptionId: SubscriptionId): Effect.Effect<readonly Grant[], RepositoryError>
    findActiveByType(type: GrantType): Effect.Effect<readonly Grant[], RepositoryError>
    findAllActive(): Effect.Effect<readonly Grant[], RepositoryError>
    save(grant: Grant): Effect.Effect<void, RepositoryError>
    saveMany(grants: readonly Grant[]): Effect.Effect<void, RepositoryError>
    revokeBySubscription(subscriptionId: SubscriptionId): Effect.Effect<void, RepositoryError>
    delete(id: GrantId): Effect.Effect<void, RepositoryError>
    deleteBySubscription(subscriptionId: SubscriptionId): Effect.Effect<void, RepositoryError>
  }
>()("@domain/subscriptions/GrantRepository") {}
