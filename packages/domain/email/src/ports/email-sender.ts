import { Data, type Effect } from "effect"

export interface EmailMessage {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
  readonly replyTo?: string
}

export interface EmailSender {
  readonly send: (message: EmailMessage) => Effect.Effect<void, EmailSendError>
}

export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Failed to send email"
}
