import { FLAGGER_DEFAULT_SAMPLING, listQueueStrategySlugs } from "@domain/annotation-queues"
import { generateId } from "@domain/shared"
import { SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { flaggers } from "../../schema/flaggers.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const seedFlaggers: Seeder = {
  name: "flaggers/acme-default-flaggers",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const slugs = listQueueStrategySlugs()
        const now = new Date()

        for (const slug of slugs) {
          const [existing] = await ctx.db
            .select({ id: flaggers.id })
            .from(flaggers)
            .where(
              and(
                eq(flaggers.organizationId, SEED_ORG_ID),
                eq(flaggers.projectId, SEED_PROJECT_ID),
                eq(flaggers.slug, slug),
              ),
            )
            .limit(1)

          if (existing) continue

          await ctx.db.insert(flaggers).values({
            id: generateId(),
            organizationId: SEED_ORG_ID,
            projectId: SEED_PROJECT_ID,
            slug,
            enabled: true,
            sampling: FLAGGER_DEFAULT_SAMPLING,
            createdAt: now,
            updatedAt: now,
          })
        }

        console.log(`  -> flaggers: ${slugs.length} provisioned`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed flaggers", cause: error }),
    }).pipe(Effect.asVoid),
}

export const flaggerSeeders: readonly Seeder[] = [seedFlaggers]
