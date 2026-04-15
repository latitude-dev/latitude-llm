import type { OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { WeaviateClient } from "weaviate-client"
import { WvQueryClientLive } from "./wv-query-client.ts"

/**
 * Bundle one or more Weaviate-backed repository layers from a shared client,
 * returning a pipe-compatible provider function.
 *
 * @example
 * ```ts
 * effect.pipe(
 *   withWeaviate(IssueProjectionRepositoryLive, client, orgId),
 * )
 * ```
 */
export const withWeaviate = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  client: WeaviateClient,
  organizationId: OrganizationId,
) => Effect.provide(layer.pipe(Layer.provideMerge(WvQueryClientLive(client, organizationId))))
