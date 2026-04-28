import { FLAGGER_DEFAULT_SAMPLING, listQueueStrategySlugs } from "@domain/annotation-queues"
import { generateId } from "@domain/shared"
import { SEED_LATITUDE_TELEMETRY_PROJECT_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { flaggers } from "../../schema/flaggers.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const projectIds = [SEED_PROJECT_ID, SEED_LATITUDE_TELEMETRY_PROJECT_ID] as const

const seedFlaggers: Seeder = {
  name: "flaggers/seed-project-flaggers",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const slugs = listQueueStrategySlugs()
        const now = new Date()

        for (const projectId of projectIds) {
          for (const slug of slugs) {
            const [existing] = await ctx.db
              .select({ id: flaggers.id })
              .from(flaggers)
              .where(
                and(
                  eq(flaggers.organizationId, SEED_ORG_ID),
                  eq(flaggers.projectId, projectId),
                  eq(flaggers.slug, slug),
                ),
              )
              .limit(1)

            if (existing) continue

            await ctx.db.insert(flaggers).values({
              id: generateId(),
              organizationId: SEED_ORG_ID,
              projectId,
              slug,
              enabled: true,
              sampling: FLAGGER_DEFAULT_SAMPLING,
              createdAt: now,
              updatedAt: now,
            })
          }
        }

        console.log(`  -> flaggers: ${slugs.length * projectIds.length} provisioned`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed flaggers", cause: error }),
    }).pipe(Effect.asVoid),
}

export const flaggerSeeders: readonly Seeder[] = [seedFlaggers]
