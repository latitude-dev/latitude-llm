import { Data } from "effect"

export class EvaluationNotFoundError extends Data.TaggedError("EvaluationNotFoundError")<{
  readonly evaluationId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Evaluation not found"
}

export class EvaluationDeletedError extends Data.TaggedError("EvaluationDeletedError")<{
  readonly evaluationId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Deleted evaluations cannot change lifecycle"
}

export class EvaluationManualRealignmentRateLimitedError extends Data.TaggedError(
  "EvaluationManualRealignmentRateLimitedError",
)<{
  readonly evaluationId: string
}> {
  readonly httpStatus = 429
  readonly httpMessage = "Manual evaluation realignment is temporarily rate limited"
}
