import type { DatasetRow } from "@domain/datasets"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

const RowFieldValueSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe("Free-form cell value. Either a plain string or an arbitrary JSON object.")

export const DatasetRowSchema = z
  .object({
    rowId: z.string().describe("Stable row identifier."),
    datasetId: cuidSchema.describe("Dataset this row belongs to."),
    input: RowFieldValueSchema,
    output: RowFieldValueSchema,
    expectedOutput: RowFieldValueSchema.describe(
      "The correct answer for this row. Curators fill this in by hand; it is not derived from `output`.",
    ),
    metadata: RowFieldValueSchema,
    createdAt: z.string().describe("ISO-8601 timestamp at which the row was inserted."),
    version: z.number().int().nonnegative().describe("Dataset version this row belongs to."),
  })
  .openapi("DatasetRow")

export const toDatasetRowResponse = (row: DatasetRow) => ({
  rowId: row.rowId as string,
  datasetId: row.datasetId as string,
  input: row.input,
  output: row.output,
  expectedOutput: row.expectedOutput,
  metadata: row.metadata,
  createdAt: row.createdAt.toISOString(),
  version: row.version,
})
