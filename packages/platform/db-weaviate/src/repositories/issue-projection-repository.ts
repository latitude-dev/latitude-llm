import {
  ISSUE_DISCOVERY_MAX_CANDIDATES,
  ISSUE_DISCOVERY_MIN_KEYWORDS,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  IssueProjectionRepository,
} from "@domain/issues"
import { toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import { Bm25Operator, type WeaviateClient } from "weaviate-client"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../collections.ts"
import { WvQueryClient } from "../wv-query-client.ts"

function getIssuesCollection(client: WeaviateClient, organizationId: string, projectId: string) {
  const tenantName = issuesCollectionTenantName({ organizationId, projectId })
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
    const wvQueryClient = yield* WvQueryClient

    return {
      upsert: (input) =>
        wvQueryClient
          .query(async (client, organizationId) => {
            const collection = await getIssuesCollection(client, organizationId, input.projectId)
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
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "IssueProjectionRepository.upsert"))),

      delete: (input) =>
        wvQueryClient
          .query(async (client, organizationId) => {
            const collection = await getIssuesCollection(client, organizationId, input.projectId)
            const exists = await collection.data.exists(input.uuid)
            if (!exists) {
              // Note: if this happens the vector db is out of sync
              // with the database! Fail silently in this case

              return
            }

            await collection.data.deleteById(input.uuid)
            const count = await collection.length()
            if (count === 0) {
              await collection.tenants.remove(
                issuesCollectionTenantName({
                  organizationId,
                  projectId: input.projectId,
                }),
              )
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "IssueProjectionRepository.delete"))),

      hybridSearch: (input) =>
        wvQueryClient
          .query(async (client, organizationId) => {
            const collection = await getIssuesCollection(client, organizationId, input.projectId)
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

            return objects.map((object) => ({
              uuid: object.uuid,
              title: object.properties.title,
              description: object.properties.description,
              score: object.metadata?.score ?? 0,
            }))
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "IssueProjectionRepository.hybridSearch"))),
    }
  }),
)
