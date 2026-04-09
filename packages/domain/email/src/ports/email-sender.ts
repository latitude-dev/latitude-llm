import type { Effect } from "effect"
import type { EmailSendError } from "../errors.ts"

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
