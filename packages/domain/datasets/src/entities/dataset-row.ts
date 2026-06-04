import { datasetIdSchema, datasetRowIdSchema } from "@domain/shared"
import { z } from "zod"

// Any JSON value a cell round-trips as. No null: it's stored as "" and reads back as "".
const rowFieldValueSchema: z.ZodType<string | number | boolean | Record<string, unknown> | unknown[]> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
])

export type RowFieldValue = z.infer<typeof rowFieldValueSchema>

// Read shapes plus null (coerced to "" on storage).
const insertRowFieldValueSchema: z.ZodType<RowFieldValue | null> = z.union([rowFieldValueSchema, z.null()])

export type InsertRowFieldValue = z.infer<typeof insertRowFieldValueSchema>

const datasetRowSchema = z.object({
  rowId: datasetRowIdSchema,
  datasetId: datasetIdSchema,
  input: rowFieldValueSchema,
  output: rowFieldValueSchema,
  expectedOutput: rowFieldValueSchema,
  metadata: rowFieldValueSchema,
  createdAt: z.date(),
  version: z.number().int().nonnegative(),
})

export type DatasetRow = z.infer<typeof datasetRowSchema>
