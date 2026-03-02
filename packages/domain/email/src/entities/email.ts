/**
 * Email entity - represents an email to be sent
 *
 * This is a simple data structure that holds email content.
 * The actual sending is handled by the EmailSender port.
 */

export interface EmailContent {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
}

export interface TemplatedEmail<TData = unknown> {
  readonly to: string
  readonly subject: string
  readonly template: string
  readonly data: TData
}
