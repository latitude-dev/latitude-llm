// Ports
export { type EmailMessage, type EmailSender, EmailSendError } from "./ports/email-sender.js";

// Entities
export type { EmailContent, TemplatedEmail } from "./entities/email.js";

// Use cases
export { sendEmail, type SendEmail } from "./use-cases/send-email.js";

// Templates
export { magicLinkTemplate, type MagicLinkEmailData } from "./templates/magic-link.js";
