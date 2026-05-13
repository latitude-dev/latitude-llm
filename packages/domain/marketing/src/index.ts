export {
  MARKETING_FIELD_MAX_LENGTH,
  MARKETING_SOURCE_V2_SIGNUP,
  MARKETING_USER_GROUP_CODE_AGENTS,
  MARKETING_USER_GROUP_PROD_TRACES,
  type MarketingUserGroup,
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
  type MarkContactTelemetryEnabledInput,
  markContactTelemetryEnabled,
} from "./use-cases/mark-contact-telemetry-enabled.ts"
export { type RegisterContactInput, registerContact } from "./use-cases/register-contact.ts"
export {
  type UpdateContactOnboardingInput,
  updateContactOnboarding,
} from "./use-cases/update-contact-onboarding.ts"
