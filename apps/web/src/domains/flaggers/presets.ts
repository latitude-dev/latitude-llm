import type { FLAGGER_STRATEGY_SLUGS } from "@domain/flaggers"

export type FlaggerPresetSlug = (typeof FLAGGER_STRATEGY_SLUGS)[number]

interface FlaggerUseCasePreset {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly enabledSlugs: ReadonlyArray<FlaggerPresetSlug>
}

export const FLAGGER_USE_CASE_PRESETS = [
  {
    id: "support-agent",
    label: "Support agent",
    description: "Customer-facing assistants handling questions, escalations, and account workflows.",
    enabledSlugs: [
      "frustration",
      "refusal",
      "forgetting",
      "tool-call-errors",
      "empty-response",
      "jailbreaking",
      "nsfw",
    ],
  },
  {
    id: "coding-agent",
    label: "Coding agent",
    description: "Agents that edit files, call tools, and work through multi-step implementation tasks.",
    enabledSlugs: [
      "laziness",
      "trashing",
      "tool-call-errors",
      "empty-response",
      "refusal",
      "forgetting",
      "output-schema-validation",
      "frustration",
    ],
  },
  {
    id: "sales-agent",
    label: "Sales agent",
    description: "Lead qualification and buyer-facing assistants where tone and follow-through matter.",
    enabledSlugs: ["frustration", "refusal", "forgetting", "empty-response", "jailbreaking", "nsfw"],
  },
  {
    id: "tool-workflow-agent",
    label: "Tool workflow agent",
    description: "Agents that coordinate tools, APIs, and structured workflows.",
    enabledSlugs: ["tool-call-errors", "trashing", "output-schema-validation", "empty-response", "laziness"],
  },
  {
    id: "knowledge-base-agent",
    label: "Knowledge-base agent",
    description: "RAG and documentation assistants that need to preserve context and answer directly.",
    enabledSlugs: ["forgetting", "refusal", "empty-response", "frustration", "laziness"],
  },
  {
    id: "structured-extraction-agent",
    label: "Structured extraction",
    description: "Extraction and classification agents that return machine-readable output.",
    enabledSlugs: ["output-schema-validation", "empty-response", "tool-call-errors", "laziness"],
  },
  {
    id: "safety-agent",
    label: "Safety agent",
    description: "Moderation and policy-sensitive assistants exposed to adversarial or unsafe inputs.",
    enabledSlugs: ["nsfw", "jailbreaking", "refusal", "frustration", "empty-response"],
  },
] as const satisfies ReadonlyArray<FlaggerUseCasePreset>

interface FlaggerGroup {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly slugs: ReadonlyArray<FlaggerPresetSlug>
}

// Groups must collectively cover every FLAGGER_STRATEGY_SLUG. Add new strategies here when they ship.
export const FLAGGER_GROUPS = [
  {
    id: "response-validity",
    label: "Response validity",
    description: "Free deterministic checks; always run on every trace.",
    slugs: ["empty-response", "tool-call-errors", "output-schema-validation"],
  },
  {
    id: "user-signals",
    label: "User-side signals",
    description: "LLM-based detection of risky or unhappy user behavior.",
    slugs: ["frustration", "jailbreaking", "nsfw"],
  },
  {
    id: "agent-behavior",
    label: "Agent behavior",
    description: "LLM-based detection of failure modes in the agent's own output.",
    slugs: ["refusal", "laziness", "forgetting", "trashing"],
  },
] as const satisfies ReadonlyArray<FlaggerGroup>

export const FLAGGER_DISPLAY_ORDER: ReadonlyArray<FlaggerPresetSlug> = FLAGGER_GROUPS.flatMap((group) => group.slugs)
