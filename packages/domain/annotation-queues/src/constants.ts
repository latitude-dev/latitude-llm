import { TRACE_RESOURCE_OUTLIER_MULTIPLIER } from "@domain/spans"

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

/** Default sampling percentage for system-created queues when provisioned. */
export const SYSTEM_QUEUE_DEFAULT_SAMPLING = 10

// ---------------------------------------------------------------------------
// Context-window limits for the system-queue flagger LLM
// ---------------------------------------------------------------------------

export const SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW = 8

export const SYSTEM_QUEUE_FLAGGER_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-lite-v1:0",
  temperature: 0,
} as const

export const SYSTEM_QUEUE_FLAGGER_MAX_TOKENS = 256

export const SYSTEM_QUEUE_ANNOTATOR_MODEL = {
  provider: "amazon-bedrock",
  model: "amazon.nova-lite-v1:0",
  temperature: 0.2,
} as const

export const SYSTEM_QUEUE_ANNOTATOR_MAX_TOKENS = 2048

export const SYSTEM_QUEUE_DRAFT_DEFAULTS = {
  passed: false,
  value: 0,
  hasAnchor: false,
} as const

// ---------------------------------------------------------------------------
// Outlier thresholds (Resource Outliers system queue)
// ---------------------------------------------------------------------------

/**
 * Multiplier applied to the project median to determine the outlier boundary.
 * A trace is flagged when its value exceeds `median * multiplier`.
 */
export const RESOURCE_OUTLIER_MULTIPLIER = TRACE_RESOURCE_OUTLIER_MULTIPLIER

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

// ---------------------------------------------------------------------------
// System-created default queue definitions
// ---------------------------------------------------------------------------

export interface SystemQueueDefinition {
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly sampling: number
}

export const SYSTEM_QUEUE_DEFINITIONS: readonly SystemQueueDefinition[] = [
  {
    slug: "jailbreaking",
    name: "Jailbreaking",
    description: "Attempts to bypass system or safety constraints",
    instructions:
      "Use this queue for prompt injection, instruction hierarchy attacks, policy-evasion attempts, tool abuse intended to bypass guardrails, role or identity escape attempts, or assistant behavior that actually follows those bypass attempts. Do not use it for harmless roleplay or ordinary unsafe requests that the assistant correctly refuses.",
    sampling: 10,
  },
  {
    slug: "refusal",
    name: "Refusal",
    description: "The assistant refuses a request it should handle",
    instructions:
      "Use this queue when the assistant declines, deflects, or over-restricts even though the request is allowed and answerable within product policy and system capabilities. Do not use it when the refusal is correct because the request is unsafe, unsupported, or missing required context or permissions.",
    sampling: 10,
  },
  {
    slug: "frustration",
    name: "Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this queue when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration.",
    sampling: 10,
  },
  {
    slug: "forgetting",
    name: "Forgetting",
    description: "The assistant forgets earlier conversation context or instructions",
    instructions:
      "Use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.",
    sampling: 10,
  },
  {
    slug: "laziness",
    name: "Laziness",
    description: "The assistant avoids doing the requested work",
    instructions:
      "Use this queue when the assistant gives a shallow partial answer, stops early without justification, refuses to inspect provided context, or pushes work back onto the user that the assistant should have done itself. Do not use it when the task is genuinely blocked by missing access, missing context, or policy constraints.",
    sampling: 10,
  },
  {
    slug: "nsfw",
    name: "NSFW",
    description: "Sexual or otherwise not-safe-for-work content appears",
    instructions:
      "Use this queue when the trace contains sexual content, explicit erotic material, or other clearly NSFW content that should be reviewed. Do not use it for benign anatomy or health discussion, mild romance, or safety-oriented policy discussion that is not itself NSFW.",
    sampling: 10,
  },
  {
    slug: "trashing",
    name: "Trashing",
    description: "The agent cycles between tools without making progress",
    instructions:
      "Use this queue when the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.",
    sampling: 10,
  },
  {
    slug: "resource-outliers",
    name: "Resource Outliers",
    description: "The trace has unusually high latency, TTFT, token usage, or cost",
    instructions:
      "Use this queue when latency, time to first token, token usage, or cost materially exceeds project norms. This queue is primarily matched through deterministic outlier checks against project percentiles, medians, and configured thresholds rather than the low-cost flagger model.",
    sampling: 100,
  },
] as const
