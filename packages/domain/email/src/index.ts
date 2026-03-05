// Ports
export { type EmailMessage, type EmailSender, EmailSendError } from "./ports/email-sender.ts"

// Entities
export type { EmailContent, TemplatedEmail } from "./entities/email.ts"

export { sendEmail, type SendEmail } from "./use-cases/send-email.ts"

// Templates
export type { RenderedEmail } from "./templates/types.ts"
export { inviteMagicLinkTemplate, type InviteMagicLinkEmailData } from "./templates/invite-magic-link.tsx"
export { magicLinkTemplate, type MagicLinkEmailData } from "./templates/magic-link.tsx"
export {
  signupExistingAccountMagicLinkTemplate,
  type SignupExistingAccountMagicLinkEmailData,
} from "./templates/signup-existing-account-magic-link.tsx"
