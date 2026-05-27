import { Data } from "effect"

export class ChangelogReadError extends Data.TaggedError("ChangelogReadError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 502
  readonly httpMessage = "Failed to load changelog"
}
