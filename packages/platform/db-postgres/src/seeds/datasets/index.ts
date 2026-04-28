import { DatasetId, DatasetVersionId } from "@domain/shared"
import { COMBINATION_DATASET_ROWS, type SeedScope, WARRANTY_DATASET_ROWS } from "@domain/shared/seeding"
import { Effect } from "effect"
import { datasets } from "../../schema/datasets.ts"
import { datasetVersions } from "../../schema/datasetVersions.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

/**
 * Two seeded datasets, both expressed in terms of the per-project scope so
 * the same definition writes the canonical dataset ids under
 * `SEED_PROJECT_ID` for `pnpm seed`, and a fresh pair of ids under any
 * runtime-created demo project. The dataset *content* (rows, names,
 * descriptions) is identical across projects — only the row identity
 * shifts with the scope.
 */
const seededDatasets = (scope: SeedScope) =>
  [
    {
      id: DatasetId(scope.cuid("dataset:warranty")),
      versionId: DatasetVersionId(scope.cuid("dataset:warranty:version")),
      name: "Warranty Coverage Guardrails",
      description:
        "Golden dataset for the Acme support agent's warranty claims workflow. Rows cover cliff-use exclusions, " +
        "legitimate defect cases, and tricky requests that try to turn scoped reviews into guaranteed coverage.",
      rowsInserted: WARRANTY_DATASET_ROWS.length,
    },
    {
      id: DatasetId(scope.cuid("dataset:combination")),
      versionId: DatasetVersionId(scope.cuid("dataset:combination:version")),
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
        for (const dataset of seededDatasets(ctx.scope)) {
          await ctx.db
            .insert(datasets)
            .values({
              id: dataset.id,
              organizationId: ctx.scope.organizationId,
              projectId: ctx.scope.projectId,
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
              organizationId: ctx.scope.organizationId,
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
