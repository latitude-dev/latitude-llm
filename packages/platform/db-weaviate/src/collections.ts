import type { IssuesCollectionProperties } from "@domain/issues"
import type { WeaviateClient } from "weaviate-client"
import { configure, dataType, tokenization, vectorDistances, vectors } from "weaviate-client"
import { defineWeaviateCollections } from "./migrations.ts"

export const WeaviateCollection = {
  Issues: "Issues",
} as const

export type WeaviateCollection = (typeof WeaviateCollection)[keyof typeof WeaviateCollection]

/**
 * Build the Weaviate multi-tenancy tenant name for project-scoped issues.
 *
 * Weaviate tenant names only allow alphanumeric, underscore, and hyphen
 * (1–64 chars), so we join with `_` instead of `:`.
 */
export const issuesCollectionTenantName = ({
  organizationId,
  projectId,
}: {
  organizationId: string
  projectId: string
}): string => `${organizationId}_${projectId}`

export async function getCollectionForTenant(
  {
    tenantName,
    collectionName,
  }: {
    tenantName: string
    collectionName: WeaviateCollection
  },
  client: WeaviateClient,
) {
  const collection = client.collections.get<IssuesCollectionProperties>(collectionName)
  const exists = await collection.tenants.getByName(tenantName)
  if (!exists) {
    await collection.tenants.create([{ name: tenantName }])
  }
  return collection.withTenant(tenantName)
}

export const defaultWeaviateCollectionDefinitions = defineWeaviateCollections([
  {
    name: WeaviateCollection.Issues,
    properties: [
      {
        name: "title", // searchable issue title mirrored from Postgres; trigram tokenization for partial/fuzzy matching
        dataType: dataType.TEXT,
        indexSearchable: true, // Note: enables BM25 hybrid search
        indexFilterable: false,
        indexRangeFilters: false,
        tokenization: tokenization.TRIGRAM,
        skipVectorization: true, // vectors are self-provided from the centroid, not generated from text
        vectorizePropertyName: false,
      },
      {
        name: "description", // searchable issue description mirrored from Postgres; word tokenization for keyword matching
        dataType: dataType.TEXT,
        indexSearchable: true,
        indexFilterable: false, // Note: enables BM25 hybrid search
        indexRangeFilters: false,
        tokenization: tokenization.WORD,
        skipVectorization: true, // vectors are self-provided from the centroid, not generated from text
        vectorizePropertyName: false,
      },
    ],
    // Self-provided vectors equal to the normalized issue centroid (normalizeIssueCentroid);
    // cosine distance; dynamic indexing switches from flat to HNSW at 10k objects; no quantization
    vectorizers: vectors.selfProvided({
      quantizer: configure.vectorIndex.quantizer.none(),
      vectorIndexConfig: configure.vectorIndex.dynamic({
        distanceMetric: vectorDistances.COSINE,
        threshold: 10_000,
      }),
    }),
    // BM25 tuned for short issue texts (b=0.35 reduces length normalization, k1=1.1 slightly above default)
    invertedIndex: configure.invertedIndex({
      bm25b: 0.35,
      bm25k1: 1.1,
      indexTimestamps: false,
      indexPropertyLength: false,
      indexNullState: false,
    }),
    multiTenancy: configure.multiTenancy({
      enabled: true,
      autoTenantActivation: true,
      autoTenantCreation: true,
    }),
  },
])
