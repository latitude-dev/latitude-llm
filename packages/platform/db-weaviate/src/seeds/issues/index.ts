import { CENTROID_EMBEDDING_DIMENSIONS } from "@domain/issues"
import { SEED_ISSUE_UUID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared"
import { Effect } from "effect"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../../collections.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const TENANT_NAME = issuesCollectionTenantName({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
})

/**
 * Random unit vector for seed data only.
 * In production, vectors come from `normalizeIssueCentroid` — a normalized
 * accumulation of real score embeddings from the `voyage-4-large` model.
 */
const randomUnitVector = (dims: number): number[] => {
  const vec = Array.from({ length: dims }, () => Math.random() - 0.5)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map((v) => v / norm)
}

const properties = {
  title: "Secret leakage in final answers",
  description:
    "The agent exposes private tokens, API keys, or other sensitive information in its final answer. " +
    "This pattern appears across different conversations where the agent is asked to interact with " +
    "external services or manage credentials on behalf of the user.",
}

const seedIssues: Seeder = {
  name: "issues/canonical-lifecycle-samples",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const collection = await getCollectionForTenant(
          {
            tenantName: TENANT_NAME,
            collectionName: WeaviateCollection.Issues,
          },
          ctx.client,
        )

        const exists = await collection.data.exists(SEED_ISSUE_UUID)

        const data = {
          id: SEED_ISSUE_UUID,
          properties,
          vectors: randomUnitVector(CENTROID_EMBEDDING_DIMENSIONS),
        }

        if (exists) {
          await collection.data.replace(data)
        } else {
          await collection.data.insert(data)
        }

        console.log(`    tenant: ${TENANT_NAME}`)
        console.log(`    uuid:   ${SEED_ISSUE_UUID}`)
        console.log(`    vector: ${CENTROID_EMBEDDING_DIMENSIONS} dims (random unit vector)`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
