import {
  COMBINATION_DATASET_ROWS,
  SEED_DATASET_ID,
  SEED_DATASET_VERSION_ID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_WARRANTY_DATASET_ID,
  SEED_WARRANTY_DATASET_VERSION_ID,
  WARRANTY_DATASET_ROWS,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { datasets } from "../../schema/datasets.ts"
import { datasetVersions } from "../../schema/datasetVersions.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const seededDatasets = [
  {
    id: SEED_WARRANTY_DATASET_ID,
    versionId: SEED_WARRANTY_DATASET_VERSION_ID,
    name: "Warranty Coverage Guardrails",
    description:
      "Golden dataset for the Acme support agent's warranty claims workflow. Rows cover cliff-use exclusions, " +
      "legitimate defect cases, and tricky requests that try to turn scoped reviews into guaranteed coverage.",
    rowsInserted: WARRANTY_DATASET_ROWS.length,
  },
  {
    id: SEED_DATASET_ID,
    versionId: SEED_DATASET_VERSION_ID,
    name: "Dangerous Combination Guardrails",
    description:
      "Golden dataset for testing Support Agent behavior on dangerous product combination requests. Each row is " +
      "a scenario where the agent must refuse, warn, or defer rather than recommend combining products.",
    rowsInserted: COMBINATION_DATASET_ROWS.length,
  },
] as const

const seedDatasets: Seeder = {
  name: "datasets/issue-guardrail-datasets",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const dataset of seededDatasets) {
          await ctx.db
            .insert(datasets)
            .values({
              id: dataset.id,
              organizationId: SEED_ORG_ID,
              projectId: SEED_PROJECT_ID,
              name: dataset.name,
              description: dataset.description,
              currentVersion: 1,
            })
            .onConflictDoUpdate({
              target: datasets.id,
              set: {
                name: dataset.name,
                description: dataset.description,
                currentVersion: 1,
              },
            })

          await ctx.db
            .insert(datasetVersions)
            .values({
              id: dataset.versionId,
              organizationId: SEED_ORG_ID,
              datasetId: dataset.id,
              version: 1,
              rowsInserted: dataset.rowsInserted,
              source: "seed",
            })
            .onConflictDoUpdate({
              target: datasetVersions.id,
              set: {
                version: 1,
                rowsInserted: dataset.rowsInserted,
                source: "seed",
              },
            })

          console.log(`  -> dataset: ${dataset.name} (version 1, ${dataset.rowsInserted} rows)`)
        }
      },
      catch: (error) => new SeedError({ reason: "Failed to seed datasets", cause: error }),
    }).pipe(Effect.asVoid),
}

export const datasetSeeders: readonly Seeder[] = [seedDatasets]
