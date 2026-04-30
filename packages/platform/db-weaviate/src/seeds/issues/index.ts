import { normalizeIssueCentroid } from "@domain/issues"
import { and, closePostgres, createPostgresClient, eq } from "@platform/db-postgres"
import { issues as pgIssues } from "@platform/db-postgres/schema/issues"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../../collections.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const tenantName = issuesCollectionTenantName({
          organizationId: ctx.scope.organizationId,
          projectId: ctx.scope.projectId,
        })
        const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
        const postgresClient = createPostgresClient({ databaseUrl: adminUrl })
        const collection = await getCollectionForTenant(
          {
            tenantName,
            collectionName: WeaviateCollection.Issues,
          },
          ctx.client,
        )
        try {
          // Push the (org, project) predicate into SQL — without it the
          // runtime demo-project workflow scans the entire `latitude.issues`
          // table just to filter in-memory, which gets ugly as the workspace
          // grows. Drizzle's `eq` infers the branded id type from the column,
          // so no casts needed.
          const seededIssueRows = await postgresClient.db
            .select()
            .from(pgIssues)
            .where(
              and(eq(pgIssues.organizationId, ctx.scope.organizationId), eq(pgIssues.projectId, ctx.scope.projectId)),
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

          console.log(`    tenant: ${tenantName}`)
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
