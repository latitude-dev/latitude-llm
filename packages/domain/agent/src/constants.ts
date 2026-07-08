/** Wall-clock ceiling for one turn, including any time spent awaiting user confirmation. */
export const AGENT_TURN_DEADLINE_MS = 600_000

/** How long a single confirmation may wait for the user before the tool call is auto-declined. */
export const CONFIRMATION_DEADLINE_MS = 300_000

/** Hard cap on provider steps per turn. */
export const AGENT_MAX_STEPS = 24

/** Tool results longer than this are truncated before returning to the model, to bound context/cost. */
export const AGENT_TOOL_RESULT_MAX_CHARS = 12_000

/**
 * Access tiers that require explicit user confirmation before the operation runs.
 * Read-only tools run immediately; every mutation is gated. Relax to just
 * `["destructive"]` if additive writes should run without a prompt.
 */
export const CONFIRM_ACCESS_LEVELS = ["write", "destructive"] as const

/** Maximum length of a single user message, enforced at the endpoint. */
export const AGENT_PROMPT_MAX_LENGTH = 4000

/** Idempotency claim TTL for a turn job; outlives the event-stream TTL so a slow turn keeps its claim. */
export const AGENT_TURN_CLAIM_TTL_SECONDS = 1800

/** TTL for a confirmation decision key. */
export const AGENT_DECISION_TTL_SECONDS = 600

/** Language model that drives the command-palette agent. Overridable via `LAT_AI_COMMAND_PALETTE_AGENT_*`. */
export const AGENT_DEFAULT_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-sonnet-4-6",
  reasoning: "medium",
} as const
