export {
  MARKETING_FIELD_MAX_LENGTH,
  MARKETING_SOURCE_V2_SIGNUP,
  MARKETING_USER_GROUP_CODE_AGENTS,
  MARKETING_USER_GROUP_PROD_TRACES,
  type MarketingUserGroup,
  type OnboardingType,
  onboardingTypeSchema,
  type StackChoice,
  stackChoiceSchema,
  stackChoiceToOnboardingType,
} from "./constants.ts"
export { MarketingContactsError } from "./errors.ts"
export {
  type MarketingContactsPort,
  type MarketingCreateContactInput,
  type MarketingUpdateContactInput,
  marketingCreateContactInputSchema,
  marketingUpdateContactInputSchema,
  marketingUserGroupSchema,
} from "./ports/marketing-contacts.ts"
export {
  type MarketingAttribution,
  SIGNUP_ATTRIBUTION_TTL_SECONDS,
  type SignupAttributionInput,
  signupAttributionCacheKey,
  signupAttributionInputSchema,
  toMarketingAttribution,
} from "./signup-attribution.ts"
export {
  type ConsumeSignupAttributionInput,
  consumeSignupAttribution,
} from "./use-cases/consume-signup-attribution.ts"
export {
  type MarkContactTelemetryEnabledInput,
  markContactTelemetryEnabled,
} from "./use-cases/mark-contact-telemetry-enabled.ts"
export { type RegisterContactInput, registerContact } from "./use-cases/register-contact.ts"
export {
  type StashSignupAttributionInput,
  stashSignupAttribution,
} from "./use-cases/stash-signup-attribution.ts"
export {
  type UpdateContactOnboardingInput,
  updateContactOnboarding,
} from "./use-cases/update-contact-onboarding.ts"
