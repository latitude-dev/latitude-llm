import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Data } from "effect"

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

export class RowNotFoundError extends Data.TaggedError("RowNotFoundError")<{
  readonly rowId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Row ${this.rowId} not found`
  }
}
