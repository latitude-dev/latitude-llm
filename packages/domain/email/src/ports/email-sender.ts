import { Data, type Effect } from "effect"

/**
 * Email sender port - interface for sending emails
 *
 * This port abstracts email delivery so the domain doesn't depend
 * on specific email providers (SMTP, SendGrid, Mailpit, etc.)
 */

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
}> {}
