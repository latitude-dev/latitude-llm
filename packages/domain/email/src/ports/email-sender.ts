import { defineError } from "@domain/shared"
import type { Effect } from "effect"

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

export class EmailSendError extends defineError("EmailSendError", 500, "Failed to send email")<{
  readonly message: string
  readonly cause?: unknown
}> {}
