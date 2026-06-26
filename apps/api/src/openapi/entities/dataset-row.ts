import { type DatasetColumn, type DatasetRow, visibleRow } from "@domain/datasets"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

const RowFieldValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown())])
  .describe("Free-form cell value: any JSON scalar, array, or object.")

export const DatasetRowSchema = z
  .object({
    rowId: z.string().describe("Stable row identifier."),
    datasetId: cuidSchema.describe("Dataset this row belongs to."),
    input: RowFieldValueSchema.optional().describe("Input cell. Omitted when the `input` column is removed."),
    output: RowFieldValueSchema.optional().describe("Output cell. Omitted when the `output` column is removed."),
    expectedOutput: RowFieldValueSchema.optional().describe(
      "The correct answer for this row. Curators fill this in by hand; it is not derived from `output`. Omitted when the `expectedOutput` column is removed.",
    ),
    metadata: RowFieldValueSchema.optional().describe("Metadata cell. Omitted when the `metadata` column is removed."),
    custom: z
      .record(z.string(), RowFieldValueSchema)
      .describe("Custom column values keyed by column identifier. Removed columns are excluded; `{}` when none."),
    createdAt: z.string().describe("ISO-8601 timestamp at which the row was inserted."),
    version: z.number().int().nonnegative().describe("Dataset version this row belongs to."),
  })
  .openapi("DatasetRow")

export const toDatasetRowResponse = (row: DatasetRow, columns: DatasetColumn[] | null) => {
  const visible = visibleRow(row, columns)
  return {
    rowId: row.rowId as string,
    datasetId: row.datasetId as string,
    ...visible,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  }
}
