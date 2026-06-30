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

export class EvaluationExecutionError extends Data.TaggedError("EvaluationExecutionError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message
  }
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

export class EvaluationScriptGenerationError extends Data.TaggedError("EvaluationScriptGenerationError")<{
  readonly attempts: number
  readonly message: string | null
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message ?? "Could not generate a runnable evaluation script"
  }
}

export class LiveEvaluationQueuePublishError extends Data.TaggedError("LiveEvaluationQueuePublishError")<{
  readonly evaluationId: string
  readonly traceId: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 503
  readonly httpMessage = "Failed to enqueue live evaluation execution"
}
