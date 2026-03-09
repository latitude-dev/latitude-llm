export type {
  AuthIntent,
  AuthIntentData,
  AuthIntentType,
  InviteIntentData,
  MagicLinkEmailTemplate,
  SignupIntentData,
} from "./types.ts"

export { createAuthIntent } from "./entities/auth-intent.ts"

export {
  createInviteIntentData,
  createSignupIntentData,
  normalizeEmail,
  resolveMagicLinkEmailTemplateFromContext,
  shouldCreateOrganizationForIntent,
} from "./use-cases/auth-intent-policy.ts"

export {
  createLoginIntentUseCase,
  LoginUserNotFoundError,
  type CreateLoginIntentError,
} from "./use-cases/create-login-intent.ts"
export { createInviteIntentUseCase } from "./use-cases/create-invite-intent.ts"
export { createSignupIntentUseCase } from "./use-cases/create-signup-intent.ts"
export {
  completeAuthIntentUseCase,
  AuthIntentExpiredError,
  AuthIntentEmailMismatchError,
  MissingSignupProvisioningDataError,
  MissingInviteDataError,
  type CompleteAuthIntentError,
  type CompleteAuthIntentRequirements,
} from "./use-cases/complete-auth-intent.ts"

export { AuthIntentRepository, type PendingInvite } from "./ports/auth-intent-repository.ts"
export { AuthUserRepository, type AuthUser } from "./ports/auth-user-repository.ts"
