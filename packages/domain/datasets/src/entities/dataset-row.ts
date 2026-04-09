import { datasetIdSchema, datasetRowIdSchema } from "@domain/shared"
import { z } from "zod"

export const rowFieldValueSchema: z.ZodType<string | Record<string, unknown>> = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
])

export type RowFieldValue = z.infer<typeof rowFieldValueSchema>

export const insertRowFieldValueSchema: z.ZodType<RowFieldValue | number | boolean | null> = z.union([
  rowFieldValueSchema,
  z.number(),
  z.boolean(),
  z.null(),
])

export type InsertRowFieldValue = z.infer<typeof insertRowFieldValueSchema>

export const datasetRowSchema = z.object({
  rowId: datasetRowIdSchema,
  datasetId: datasetIdSchema,
  input: rowFieldValueSchema,
  output: rowFieldValueSchema,
  metadata: rowFieldValueSchema,
  createdAt: z.date(),
  version: z.number().int().nonnegative(),
})

export type DatasetRow = z.infer<typeof datasetRowSchema>
