import {
  ISSUE_DISCOVERY_MAX_CANDIDATES,
  ISSUE_DISCOVERY_MIN_KEYWORDS,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  IssueProjectionRepository,
} from "@domain/issues"
import { RepositoryError } from "@domain/shared"
import { Effect, Layer, ServiceMap } from "effect"
import { Bm25Operator, type WeaviateClient } from "weaviate-client"
import { getCollectionForTenant, WeaviateCollection } from "../collections.ts"

class WeaviateClientService extends ServiceMap.Service<WeaviateClientService, { readonly client: WeaviateClient }>()(
  "@platform/db-weaviate/WeaviateClient",
) {}

function getIssuesCollection(client: WeaviateClient, tenantName: string) {
  return getCollectionForTenant(
    {
      tenantName,
      collectionName: WeaviateCollection.Issues,
    },
    client,
  )
}

export const IssueProjectionRepositoryLive = Layer.effect(
  IssueProjectionRepository,
  Effect.gen(function* () {
    const { client } = yield* WeaviateClientService

    return {
      upsert: (input) =>
        Effect.tryPromise({
          try: async () => {
            const collection = await getIssuesCollection(client, input.tenantName)
            const exists = await collection.data.exists(input.uuid)
            if (exists) {
              await collection.data.replace({
                id: input.uuid,
                properties: {
                  title: input.title,
                  description: input.description,
                },
                vectors: input.vector,
              })
            } else {
              await collection.data.insert({
                id: input.uuid,
                properties: {
                  title: input.title,
                  description: input.description,
                },
                vectors: input.vector,
              })
            }
          },
          catch: (cause) =>
            new RepositoryError({
              cause,
              operation: "IssueProjectionRepository.upsert",
            }),
        }),

      delete: (input) =>
        Effect.tryPromise({
          try: async () => {
            const collection = await getIssuesCollection(client, input.tenantName)
            const exists = await collection.data.exists(input.uuid)
            if (!exists) {
              // Note: if this happens the vector db is out of sync
              // with the database! Fail silently in this case

              return
            }

            await collection.data.deleteById(input.uuid)
            const count = await collection.length()
            if (count === 0) {
              await collection.tenants.remove(input.tenantName)
            }
          },
          catch: (cause) =>
            new RepositoryError({
              cause,
              operation: "IssueProjectionRepository.delete",
            }),
        }),

      hybridSearch: (input) =>
        Effect.tryPromise({
          try: async () => {
            const collection = await getIssuesCollection(client, input.tenantName)
            const { objects } = await collection.query.hybrid(input.query, {
              vector: input.vector,
              alpha: ISSUE_DISCOVERY_SEARCH_RATIO,
              maxVectorDistance: 1 - ISSUE_DISCOVERY_MIN_SIMILARITY,
              bm25Operator: Bm25Operator.or({
                minimumMatch: ISSUE_DISCOVERY_MIN_KEYWORDS,
              }),
              fusionType: "RelativeScore",
              limit: ISSUE_DISCOVERY_MAX_CANDIDATES,
              returnProperties: ["title", "description"],
              returnMetadata: ["score"],
            })

            if (objects.length === 0) return []

            // TODO: implement search in PG issues repository
            // missing filtering this candidates
            // Check v1 for implementation details:
            return objects.map((object) => ({
              uuid: object.uuid,
              title: object.properties.title,
              description: object.properties.description,
              score: object.metadata?.score ?? 0,
            }))
          },
          catch: (cause) =>
            new RepositoryError({
              cause,
              operation: "IssueProjectionRepository.hybridSearch",
            }),
        }),
    }
  }),
)
