export { createAuthIntent } from "./entities/auth-intent.ts"
// Repositories
export { AuthIntentRepository, type PendingInvite } from "./ports/auth-intent-repository.ts"
export type {
  AuthIntent,
  AuthIntentData,
  AuthIntentType,
  InviteIntentData,
  MagicLinkEmailTemplate,
  SignupIntentData,
} from "./types.ts"
export {
  createInviteIntentData,
  createSignupIntentData,
  normalizeEmail,
  resolveMagicLinkEmailTemplateFromContext,
  shouldCreateOrganizationForIntent,
} from "./use-cases/auth-intent-policy.ts"
export {
  AuthIntentEmailMismatchError,
  completeAuthIntentUseCase,
  InvalidAuthIntentTypeError,
  MissingInviteDataError,
  MissingSignupProvisioningDataError,
} from "./use-cases/complete-auth-intent.ts"
export { createInviteIntentUseCase, InviteAlreadyPendingError } from "./use-cases/create-invite-intent.ts"
export { createLoginIntentUseCase, LoginUserNotFoundError } from "./use-cases/create-login-intent.ts"
export { createSignupIntentUseCase } from "./use-cases/create-signup-intent.ts"
