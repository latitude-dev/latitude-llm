import type { NotFoundError, RepositoryError, SubscriptionId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Subscription } from "../entities/subscription.ts"

export class SubscriptionRepository extends ServiceMap.Service<
  SubscriptionRepository,
  {
    findById(id: SubscriptionId): Effect.Effect<Subscription, NotFoundError | RepositoryError>
    findActive(): Effect.Effect<Subscription, NotFoundError | RepositoryError>
    findAll(): Effect.Effect<readonly Subscription[], RepositoryError>
    save(subscription: Subscription): Effect.Effect<void, RepositoryError>
    delete(id: SubscriptionId): Effect.Effect<void, RepositoryError>
    exists(): Effect.Effect<boolean, RepositoryError>
  }
>()("@domain/subscriptions/SubscriptionRepository") {}
