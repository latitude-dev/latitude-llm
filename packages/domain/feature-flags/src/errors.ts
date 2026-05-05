import { Data } from "effect"

export class DuplicateFeatureFlagIdentifierError extends Data.TaggedError("DuplicateFeatureFlagIdentifierError")<{
  readonly identifier: string
}> {}

export class FeatureFlagNotFoundError extends Data.TaggedError("FeatureFlagNotFoundError")<{
  readonly identifier: string
}> {}

export class InvalidFeatureFlagIdentifierError extends Data.TaggedError("InvalidFeatureFlagIdentifierError")<{
  readonly identifier: string
  readonly reason: string
}> {}
