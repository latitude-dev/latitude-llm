export const FEATURE_FLAG_IDENTIFIER_MAX_LENGTH = 128
export const FEATURE_FLAG_NAME_MAX_LENGTH = 256

/**
 * Known feature-flag identifiers used from code. Flags are otherwise dynamic
 * (created/toggled through the backoffice), but any flag the app reads needs a
 * typed constant here so a typo can't silently disable the gate.
 */
export const CLAUDE_CODE_WRAPPED_FLAG = "claude-code-wrapped" as const
