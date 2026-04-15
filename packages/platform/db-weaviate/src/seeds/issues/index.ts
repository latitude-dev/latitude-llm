import { normalizeIssueCentroid } from "@domain/issues"
import { SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { closePostgres, createPostgresClient } from "@platform/db-postgres"
import { issues as pgIssues } from "@platform/db-postgres/schema/issues"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../../collections.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const TENANT_NAME = issuesCollectionTenantName({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
})

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
        const postgresClient = createPostgresClient({ databaseUrl: adminUrl })
        const collection = await getCollectionForTenant(
          {
            tenantName: TENANT_NAME,
            collectionName: WeaviateCollection.Issues,
          },
          ctx.client,
        )
        try {
          const seededIssueRows = (await postgresClient.db.select().from(pgIssues)).filter(
            (row) => row.organizationId === SEED_ORG_ID && row.projectId === SEED_PROJECT_ID,
          )

          for (const row of seededIssueRows) {
            const vector = normalizeIssueCentroid(row.centroid)
            if (vector.length === 0) {
              throw new Error(`Seeded issue ${row.id} has an empty centroid and cannot be projected to Weaviate`)
            }

            const data = {
              id: row.uuid,
              properties: {
                title: row.name,
                description: row.description,
              },
              vectors: vector,
            }

            const exists = await collection.data.exists(row.uuid)

            if (exists) {
              await collection.data.replace(data)
            } else {
              await collection.data.insert(data)
            }
          }

          console.log(`    tenant: ${TENANT_NAME}`)
          console.log(`    issues: ${seededIssueRows.length}`)
          console.log("    vector: normalized issue centroids from Postgres")
        } finally {
          await closePostgres(postgresClient.pool)
        }
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
