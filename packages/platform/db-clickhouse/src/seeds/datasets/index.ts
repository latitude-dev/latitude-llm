import {
  COMBINATION_DATASET_ROWS,
  SEED_DATASET_ID,
  SEED_ORG_ID,
  SEED_WARRANTY_DATASET_ID,
  WARRANTY_DATASET_ROWS,
} from "@domain/shared/seeding"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"

const XACT_ID = 1

const datasetRows = [
  ...WARRANTY_DATASET_ROWS.map((row, i) => ({
    organization_id: SEED_ORG_ID,
    dataset_id: SEED_WARRANTY_DATASET_ID,
    row_id: `warranty-row-${String(i + 1).padStart(3, "0")}`,
    xact_id: XACT_ID,
    input: JSON.stringify(row.input),
    output: JSON.stringify(row.output),
    metadata: JSON.stringify(row.metadata),
  })),
  ...COMBINATION_DATASET_ROWS.map((row, i) => ({
    organization_id: SEED_ORG_ID,
    dataset_id: SEED_DATASET_ID,
    row_id: `combination-row-${String(i + 1).padStart(3, "0")}`,
    xact_id: XACT_ID,
    input: JSON.stringify(row.input),
    output: JSON.stringify(row.output),
    metadata: JSON.stringify(row.metadata),
  })),
]

const seedDatasetRows: Seeder = {
  name: "datasets/issue-guardrail-dataset-rows",
  run: (ctx) => insertJsonEachRow(ctx.client, "dataset_rows", datasetRows),
}

export const datasetRowSeeders: Seeder[] = [seedDatasetRows]
