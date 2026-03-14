import { SEED_DATASET_ID, SEED_DATASET_VERSION_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared"
import { Effect } from "effect"
import { postgresSchema } from "../../index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const seedDatasets: Seeder = {
  name: "datasets/big-comma-delimiter",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        await ctx.db
          .insert(postgresSchema.datasets)
          .values({
            id: SEED_DATASET_ID,
            organizationId: SEED_ORG_ID,
            projectId: SEED_PROJECT_ID,
            name: "Big Comma Delimiter",
            description: "People directory with color identifiers",
            currentVersion: 1,
          })
          .onConflictDoUpdate({
            target: postgresSchema.datasets.id,
            set: {
              name: "Big Comma Delimiter",
              description: "People directory with color identifiers",
              currentVersion: 1,
            },
          })

        await ctx.db
          .insert(postgresSchema.datasetVersions)
          .values({
            id: SEED_DATASET_VERSION_ID,
            organizationId: SEED_ORG_ID,
            datasetId: SEED_DATASET_ID,
            version: 1,
            rowsInserted: 20,
            source: "seed",
          })
          .onConflictDoNothing()

        console.log("  -> dataset: Big Comma Delimiter (version 1, 20 rows)")
      },
      catch: (error) => new SeedError({ reason: "Failed to seed datasets", cause: error }),
    }).pipe(Effect.asVoid),
}

export const datasetSeeders: readonly Seeder[] = [seedDatasets]
