import {
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_SEARCH_CANDIDATES,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  IssueProjectionRepository,
} from "@domain/issues"
import { toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { WeaviateClient } from "weaviate-client"
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
              fusionType: "RelativeScore",
              limit: ISSUE_DISCOVERY_SEARCH_CANDIDATES,
              returnProperties: ["title", "description"],
              returnMetadata: ["score"],
            })

            const thresholdFilteredObjects = [...objects]
              .filter((object) => (object.metadata?.score ?? 0) >= ISSUE_DISCOVERY_MIN_SIMILARITY)
              .sort((left, right) => (right.metadata?.score ?? 0) - (left.metadata?.score ?? 0))

            return thresholdFilteredObjects.map((object) => ({
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
