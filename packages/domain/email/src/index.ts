// Ports

// Entities
export type { EmailContent, TemplatedEmail } from "./entities/email.ts"
export { emailContentSchema, templatedEmailSchema } from "./entities/email.ts"
export { type EmailMessage, EmailSendError, type EmailSender } from "./ports/email-sender.ts"
export { type DatasetExportEmailData, datasetExportTemplate } from "./templates/dataset-export/index.tsx"
export { type InviteMagicLinkEmailData, inviteMagicLinkTemplate } from "./templates/invite-magic-link/index.tsx"
export { type MagicLinkEmailData, magicLinkTemplate } from "./templates/magic-link/index.tsx"
export {
  type SignupExistingAccountMagicLinkEmailData,
  signupExistingAccountMagicLinkTemplate,
} from "./templates/signup-existing-account-magic-link/index.tsx"
export {
  type SignupMagicLinkEmailData,
  signupMagicLinkTemplate,
} from "./templates/signup-magic-link/index.tsx"
// Templates
export type { RenderedEmail } from "./templates/types.ts"
export { type SendEmail, sendEmail } from "./use-cases/send-email.ts"
