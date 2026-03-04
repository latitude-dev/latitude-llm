export type {
  AuthIntent,
  AuthIntentData,
  AuthIntentType,
  InviteIntentData,
  MagicLinkEmailTemplate,
  SignupIntentData,
} from "./types.ts"

export {
  assertIntentCanBeCompleted,
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
export { createSignupIntentUseCase } from "./use-cases/create-signup-intent.ts"
export {
  completeAuthIntentUseCase,
  AuthIntentNotFoundError,
  AuthIntentExpiredError,
  AuthIntentEmailMismatchError,
  MissingSignupProvisioningDataError,
  type CompleteAuthIntentError,
} from "./use-cases/complete-auth-intent.ts"

export type { AuthIntentRepository } from "./ports/auth-intent-repository.ts"
export type { AuthUser, AuthUserRepository } from "./ports/auth-user-repository.ts"
