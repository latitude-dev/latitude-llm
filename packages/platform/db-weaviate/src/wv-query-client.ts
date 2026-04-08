import { type OrganizationId, type RepositoryError, toRepositoryError } from "@domain/shared"
import { EffectService } from "@repo/effect-service"
import { Effect, Layer } from "effect"
import type { WeaviateClient } from "weaviate-client"

interface WvQueryClientShape {
  readonly organizationId: OrganizationId
  readonly query: <T>(
    fn: (client: WeaviateClient, organizationId: OrganizationId) => Promise<T>,
  ) => Effect.Effect<T, RepositoryError>
}

export class WvQueryClient extends EffectService<WvQueryClient, WvQueryClientShape>()(
  "@platform/db-weaviate/WvQueryClient",
) {}

export const WvQueryClientLive = (client: WeaviateClient, organizationId: OrganizationId) =>
  Layer.succeed(WvQueryClient, {
    organizationId,
    query: <T>(fn: (client: WeaviateClient, organizationId: OrganizationId) => Promise<T>) =>
      Effect.tryPromise({
        try: () => fn(client, organizationId),
        catch: (error) => toRepositoryError(error, "query"),
      }),
  } satisfies WvQueryClientShape)
