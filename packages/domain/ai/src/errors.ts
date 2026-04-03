import { Data } from "effect"

export class AIError extends Data.TaggedError("AIError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 502
  get httpMessage() {
    return this.message
  }
}

export class AICredentialError extends Data.TaggedError("AICredentialError")<{
  readonly provider: string
  readonly message: string
  readonly statusCode?: number
}> {
  get httpStatus() {
    return this.statusCode ?? 503
  }
  get httpMessage() {
    return this.message
  }
}
