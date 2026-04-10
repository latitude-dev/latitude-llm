import { CENTROID_EMBEDDING_DIMENSIONS } from "@domain/issues"
import { SEED_ISSUE_FIXTURES, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { Effect } from "effect"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../../collections.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const TENANT_NAME = issuesCollectionTenantName({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
})

const randomUnitVector = (dims: number): number[] => {
  const vec = Array.from({ length: dims }, () => Math.random() - 0.5)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map((v) => v / norm)
}

const issueDocuments = SEED_ISSUE_FIXTURES.map((issue) => ({
  id: issue.uuid,
  properties: {
    title: issue.name,
    description: issue.description,
  },
})) as const

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
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

        for (const document of issueDocuments) {
          const data = {
            id: document.id,
            properties: document.properties,
            vectors: randomUnitVector(CENTROID_EMBEDDING_DIMENSIONS),
          }

          const exists = await collection.data.exists(document.id)

          if (exists) {
            await collection.data.replace(data)
          } else {
            await collection.data.insert(data)
          }
        }

        console.log(`    tenant: ${TENANT_NAME}`)
        console.log(`    issues: ${issueDocuments.length}`)
        console.log(`    vector: ${CENTROID_EMBEDDING_DIMENSIONS} dims (random unit vector)`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
