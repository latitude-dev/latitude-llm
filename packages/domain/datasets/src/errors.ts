import { Data } from "effect"

export class DatasetNotFoundError extends Data.TaggedError("DatasetNotFoundError")<{
  readonly datasetId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Dataset ${this.datasetId} not found`
  }
}

export class DuplicateDatasetNameError extends Data.TaggedError("DuplicateDatasetNameError")<{
  readonly projectId: string
  readonly name: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `A dataset named "${this.name}" already exists in this project`
  }
}

export class TooManyTracesError extends Data.TaggedError("TooManyTracesError")<{
  readonly count: number
  readonly limit: number
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return `Selection contains ${this.count} traces, but the limit is ${this.limit}`
  }
}

export class RowNotFoundError extends Data.TaggedError("RowNotFoundError")<{
  readonly rowId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Row ${this.rowId} not found`
  }
}
