import { Data } from "effect"

export class AIError extends Data.TaggedError("AIError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}

export class AICredentialError extends Data.TaggedError("AICredentialError")<{
  readonly provider: string
  readonly message: string
}> {
  get httpStatus() {
    return this.message.startsWith("Unsupported AI provider") ? 400 : 500
  }
  get httpMessage() {
    return this.message
  }
}
