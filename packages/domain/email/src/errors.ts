import { Data } from "effect"

export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Failed to send email"
}
