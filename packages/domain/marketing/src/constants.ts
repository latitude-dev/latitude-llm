import type { OnboardingType } from "@domain/shared"

/**
 * Source value attributing new marketing contacts to the v2 signup flow. v1
 * used `latitudeLlmAppSignup`; v2 ships under `LatitudeV2Signup` so segments
 * and lifecycle automations can distinguish v2 cohorts from the v1 install
 * base.
 */
export const MARKETING_SOURCE_V2_SIGNUP = "LatitudeV2Signup"

export const MARKETING_USER_GROUP_CODE_AGENTS = "code-agents" satisfies OnboardingType
export const MARKETING_USER_GROUP_PROD_TRACES = "prod-traces" satisfies OnboardingType

export type MarketingUserGroup = OnboardingType

/**
 * Maximum length we ever send for a string custom property on a marketing
 * contact. Conservative ceiling that fits Loops' 255-char limit and most
 * comparable vendors; we truncate at the platform adapter boundary so
 * domain callers never need to worry about per-vendor limits.
 */
export const MARKETING_FIELD_MAX_LENGTH = 255
