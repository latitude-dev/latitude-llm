import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Data } from "effect"

export interface DatasetRow {
  readonly rowId: DatasetRowId
  readonly datasetId: DatasetId
  readonly input: Record<string, unknown>
  readonly output: Record<string, unknown>
  readonly metadata: Record<string, unknown>
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
