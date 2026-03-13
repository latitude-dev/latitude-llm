// Ports

// Entities
export type { EmailContent, TemplatedEmail } from "./entities/email.ts"
export { type EmailMessage, EmailSendError, type EmailSender } from "./ports/email-sender.ts"
export { type InviteMagicLinkEmailData, inviteMagicLinkTemplate } from "./templates/invite-magic-link.tsx"
export { type MagicLinkEmailData, magicLinkTemplate } from "./templates/magic-link.tsx"
export {
  type SignupExistingAccountMagicLinkEmailData,
  signupExistingAccountMagicLinkTemplate,
} from "./templates/signup-existing-account-magic-link.tsx"
// Templates
export type { RenderedEmail } from "./templates/types.ts"
export { type SendEmail, sendEmail } from "./use-cases/send-email.ts"
