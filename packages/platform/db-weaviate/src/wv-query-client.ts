import { type OrganizationId, type RepositoryError, toRepositoryError } from "@domain/shared"
import { Effect, Layer, ServiceMap } from "effect"
import type { WeaviateClient } from "weaviate-client"

interface WvQueryClientShape {
  readonly organizationId: OrganizationId
  readonly query: <T>(
    fn: (client: WeaviateClient, organizationId: OrganizationId) => Promise<T>,
  ) => Effect.Effect<T, RepositoryError>
}

export class WvQueryClient extends ServiceMap.Service<WvQueryClient, WvQueryClientShape>()(
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
