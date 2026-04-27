// ---------------------------------------------------------------------------
// Bulk import limits
// ---------------------------------------------------------------------------

/** Maximum number of traces that can be added to a queue in a single operation. */
export const MAX_TRACES_PER_QUEUE_IMPORT = 5_000

// ---------------------------------------------------------------------------
// Sampling defaults
// ---------------------------------------------------------------------------

/** Default sampling percentage for live queues when none is explicitly set. */
export const LIVE_QUEUE_DEFAULT_SAMPLING = 10

/**
 * Default sampling percentage applied to a per-project flagger row at
 * provisioning time. Only consulted by LLM-capable strategies on `no-match`.
 */
export const FLAGGER_DEFAULT_SAMPLING = 10

/**
 * Default rate limit for enqueueing the LLM flagger workflow when a strategy
 * reports `ambiguous`. The key is `{organizationId, flaggerSlug}` — a hot trace
 * topic (e.g. a jailbreak pattern firing for every request) can otherwise
 * stampede the workflow queue with thousands of LLM calls per minute.
 *
 * The limiter fails open on Redis errors so a cache outage cannot drop traffic
 * silently; we prefer over-spending on LLM calls to under-detecting issues.
 */
export const AMBIGUOUS_FLAGGER_DEFAULT_RATE_LIMIT = {
  maxRequests: 30,
  windowSeconds: 60,
} as const

// ---------------------------------------------------------------------------
// Context-window limits for the flagger LLM
// ---------------------------------------------------------------------------

export const FLAGGER_CONTEXT_WINDOW = 8

// ---------------------------------------------------------------------------
// Token budget constants for flagger-specific prompts
// ---------------------------------------------------------------------------

/** Maximum conversation stages to include in a prompt (user block -> assistant block pairs) */
export const MAX_STAGES_PER_PROMPT = 3

/** Maximum suspicious snippets to include for NSFW/jailbreaking detection */
export const MAX_SUSPICIOUS_SNIPPETS = 5

/** Maximum characters per text excerpt to keep tokens bounded */
export const MAX_EXCERPT_LENGTH = 500

/** Maximum characters per excerpt when including multiple snippets */
export const MAX_SNIPPET_EXCERPT_LENGTH = 300

export const FLAGGER_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-2-lite-v1:0",
  temperature: 0,
} as const

export const FLAGGER_MAX_TOKENS = 512

export const FLAGGER_ANNOTATOR_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-2-lite-v1:0",
  temperature: 0.2,
} as const

export const FLAGGER_ANNOTATOR_MAX_TOKENS = 2048

export const FLAGGER_DRAFT_DEFAULTS = {
  passed: false,
  value: 0,
  hasAnchor: false,
} as const

// ---------------------------------------------------------------------------
// Queue name constraints
// ---------------------------------------------------------------------------

export const ANNOTATION_QUEUE_NAME_MAX_LENGTH = 128

/** Slug can be slightly larger than name to accommodate URL-friendly transformations */
export const ANNOTATION_QUEUE_SLUG_MAX_LENGTH = 140

// ---------------------------------------------------------------------------
// Hotkey bindings for the focused queue-review screen
// ---------------------------------------------------------------------------

export const QUEUE_REVIEW_HOTKEYS = {
  previousItem: "Shift+H",
  nextItem: "Shift+L",
  markComplete: "Mod+Enter",
  addToDataset: "Shift+D",
} as const
