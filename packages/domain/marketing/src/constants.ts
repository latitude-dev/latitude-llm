/**
 * Source value attributing new marketing contacts to the v2 signup flow. v1
 * used `latitudeLlmAppSignup`; v2 ships under `LatitudeV2Signup` so segments
 * and lifecycle automations can distinguish v2 cohorts from the v1 install
 * base.
 */
export const MARKETING_SOURCE_V2_SIGNUP = "LatitudeV2Signup"

/**
 * `userGroup` mapping for the onboarding `stackChoice` field.
 * - `coding-agent-machine` -> `code-agents`
 * - `production-agent`     -> `prod-traces`
 */
export const MARKETING_USER_GROUP_CODE_AGENTS = "code-agents"
export const MARKETING_USER_GROUP_PROD_TRACES = "prod-traces"

export type MarketingUserGroup = typeof MARKETING_USER_GROUP_CODE_AGENTS | typeof MARKETING_USER_GROUP_PROD_TRACES

/**
 * Maximum length we ever send for a string custom property on a marketing
 * contact. Conservative ceiling that fits Loops' 255-char limit and most
 * comparable vendors; we truncate at the platform adapter boundary so
 * domain callers never need to worry about per-vendor limits.
 */
export const MARKETING_FIELD_MAX_LENGTH = 255
