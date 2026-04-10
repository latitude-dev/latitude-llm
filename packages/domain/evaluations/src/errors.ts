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

export class LiveEvaluationExecutionError extends Data.TaggedError("LiveEvaluationExecutionError")<{
  readonly evaluationId: string
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message
  }
}
