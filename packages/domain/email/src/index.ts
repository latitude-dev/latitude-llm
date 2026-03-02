// Ports
export { type EmailMessage, type EmailSender, EmailSendError } from "./ports/email-sender.ts"

// Entities
export type { EmailContent, TemplatedEmail } from "./entities/email.ts"

// Use cases
export { sendEmail, type SendEmail } from "./use-cases/send-email.ts"

// Templates
export { magicLinkTemplate, type MagicLinkEmailData } from "./templates/magic-link.ts"
