import { DatasetId } from "@domain/shared"
import { COMBINATION_DATASET_ROWS, type SeedScope, WARRANTY_DATASET_ROWS } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"

const XACT_ID = 1

function buildDatasetRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const warrantyDatasetId = DatasetId(scope.cuid("dataset:warranty"))
  const combinationDatasetId = DatasetId(scope.cuid("dataset:combination"))

  return [
    ...WARRANTY_DATASET_ROWS.map((row, i) => ({
      organization_id: orgId,
      dataset_id: warrantyDatasetId,
      row_id: `warranty-row-${String(i + 1).padStart(3, "0")}`,
      xact_id: XACT_ID,
      input: JSON.stringify(row.input),
      output: JSON.stringify(row.output),
      metadata: JSON.stringify(row.metadata),
    })),
    ...COMBINATION_DATASET_ROWS.map((row, i) => ({
      organization_id: orgId,
      dataset_id: combinationDatasetId,
      row_id: `combination-row-${String(i + 1).padStart(3, "0")}`,
      xact_id: XACT_ID,
      input: JSON.stringify(row.input),
      output: JSON.stringify(row.output),
      metadata: JSON.stringify(row.metadata),
    })),
  ]
}

const seedDatasetRows: Seeder = {
  name: "datasets/issue-guardrail-dataset-rows",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the first deterministic warranty row id.
      const sentinel = DatasetId(ctx.scope.cuid("dataset:warranty"))
      const present = yield* isSentinelPresent(
        ctx.client,
        "dataset_rows",
        "dataset_id = {sentinel:String} AND row_id = 'warranty-row-001'",
        { sentinel },
      )
      if (present) {
        if (!ctx.quiet) console.log("  -> datasets/issue-guardrail-dataset-rows: already seeded, skipping")
        return
      }
      yield* insertJsonEachRow(ctx.client, "dataset_rows", buildDatasetRows(ctx.scope))
    }),
}

export const datasetRowSeeders: Seeder[] = [seedDatasetRows]
