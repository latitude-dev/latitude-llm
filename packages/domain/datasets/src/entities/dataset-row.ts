import type { DatasetId, DatasetRowId } from "@domain/shared"
import { defineErrorDynamic } from "@domain/shared"

export type RowFieldValue = string | Record<string, unknown>

export type InsertRowFieldValue = RowFieldValue | number | boolean | null

export interface DatasetRow {
  readonly rowId: DatasetRowId
  readonly datasetId: DatasetId
  readonly input: RowFieldValue
  readonly output: RowFieldValue
  readonly metadata: RowFieldValue
  readonly createdAt: Date
  readonly version: number
}

export class RowNotFoundError extends defineErrorDynamic(
  "RowNotFoundError",
  404,
  (f: { rowId: string }) => `Row ${f.rowId} not found`,
)<{
  readonly rowId: string
}> {}
