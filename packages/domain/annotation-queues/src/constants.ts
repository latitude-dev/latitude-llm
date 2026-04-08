// ---------------------------------------------------------------------------
// Sampling defaults
// ---------------------------------------------------------------------------

/** Default sampling percentage for live queues when none is explicitly set. */
export const LIVE_QUEUE_DEFAULT_SAMPLING = 10

/** Default sampling percentage for system-created queues when provisioned. */
export const SYSTEM_QUEUE_DEFAULT_SAMPLING = 10

/** Canonical slug for the Tool Call Errors system queue. */
export const TOOL_CALL_ERRORS_SYSTEM_QUEUE_SLUG = "tool-call-errors"

/** Canonical slug for the Resource Outliers system queue. */
export const RESOURCE_OUTLIERS_SYSTEM_QUEUE_SLUG = "resource-outliers"

// ---------------------------------------------------------------------------
// Context-window limits for the system-queue flagger LLM
// ---------------------------------------------------------------------------

/** Maximum number of trailing messages sent to the low-cost flagger model. */
export const SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW = 8

// ---------------------------------------------------------------------------
// Outlier thresholds (Resource Outliers system queue)
// ---------------------------------------------------------------------------

/**
 * Multiplier applied to the project median to determine the outlier boundary.
 * A trace is flagged when its value exceeds `median * multiplier`.
 */
export const RESOURCE_OUTLIER_MULTIPLIER = 3

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
  previousItem: "Shift+J",
  nextItem: "Shift+K",
  markComplete: "Shift+Enter",
  addToDataset: "Shift+D",
  newAnnotation: "Shift+A",
} as const

// ---------------------------------------------------------------------------
// System-created default queue definitions
// ---------------------------------------------------------------------------

export interface SystemQueueDefinition {
  readonly name: string
  readonly description: string
  readonly instructions: string
}

export const SYSTEM_QUEUE_DEFINITIONS: readonly SystemQueueDefinition[] = [
  {
    name: "Jailbreaking",
    description: "Attempts to bypass system or safety constraints",
    instructions:
      "Use this queue for prompt injection, instruction hierarchy attacks, policy-evasion attempts, tool abuse intended to bypass guardrails, role or identity escape attempts, or assistant behavior that actually follows those bypass attempts. Do not use it for harmless roleplay or ordinary unsafe requests that the assistant correctly refuses.",
  },
  {
    name: "Refusal",
    description: "The assistant refuses a request it should handle",
    instructions:
      "Use this queue when the assistant declines, deflects, or over-restricts even though the request is allowed and answerable within product policy and system capabilities. Do not use it when the refusal is correct because the request is unsafe, unsupported, or missing required context or permissions.",
  },
  {
    name: "Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this queue when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration.",
  },
  {
    name: "Forgetting",
    description: "The assistant forgets earlier conversation context or instructions",
    instructions:
      "Use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.",
  },
  {
    name: "Laziness",
    description: "The assistant avoids doing the requested work",
    instructions:
      "Use this queue when the assistant gives a shallow partial answer, stops early without justification, refuses to inspect provided context, or pushes work back onto the user that the assistant should have done itself. Do not use it when the task is genuinely blocked by missing access, missing context, or policy constraints.",
  },
  {
    name: "NSFW",
    description: "Sexual or otherwise not-safe-for-work content appears",
    instructions:
      "Use this queue when the trace contains sexual content, explicit erotic material, or other clearly NSFW content that should be reviewed. Do not use it for benign anatomy or health discussion, mild romance, or safety-oriented policy discussion that is not itself NSFW.",
  },
  {
    name: "Tool Call Errors",
    description: "A tool call failed or returned an error state",
    instructions:
      "Use this queue when a tool span errored, a tool execution failed, a malformed tool interaction occurred, or the conversation includes a tool-result message that clearly indicates failure. This queue is primarily matched through deterministic rules rather than the low-cost flagger model.",
  },
  {
    name: "Resource Outliers",
    description: "The trace has unusually high latency, cost, or usage",
    instructions:
      "Use this queue when latency, token usage, or cost materially exceeds project norms. This queue is primarily matched through deterministic outlier checks against project medians and configured thresholds rather than the low-cost flagger model.",
  },
  {
    name: "Trashing",
    description: "The agent cycles between tools without making progress",
    instructions:
      "Use this queue when the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.",
  },
] as const

/** Names of system queues that use deterministic rules instead of the flagger LLM. */
export const DETERMINISTIC_SYSTEM_QUEUE_NAMES = ["Tool Call Errors", "Resource Outliers"] as const
