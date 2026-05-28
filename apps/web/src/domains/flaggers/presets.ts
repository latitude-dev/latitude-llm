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

// Compile-time assertion: FLAGGER_GROUPS must cover every FLAGGER_STRATEGY_SLUG. If a new slug
// is added but missing from any group, the type below resolves to the missing slug name(s)
// instead of `true`, and the assignment fails typecheck with the missing slug surfaced in the
// diagnostic. Keeps settings from silently dropping rows when a strategy ships.
type _MissingFromFlaggerGroups = Exclude<FlaggerPresetSlug, (typeof FLAGGER_GROUPS)[number]["slugs"][number]>
const _assertFlaggerGroupsExhaustive: [_MissingFromFlaggerGroups] extends [never] ? true : _MissingFromFlaggerGroups =
  true
void _assertFlaggerGroupsExhaustive

// Onboarding sorts the flat card grid by user-side first, then agent-side, then deterministic
// programmatic checks — easier-to-grasp categories lead so the user can scan and pick fast.
const ONBOARDING_GROUP_ORDER: ReadonlyArray<(typeof FLAGGER_GROUPS)[number]["id"]> = [
  "user-signals",
  "agent-behavior",
  "response-validity",
]

export const FLAGGER_ONBOARDING_ORDER: ReadonlyArray<FlaggerPresetSlug> = ONBOARDING_GROUP_ORDER.flatMap(
  (groupId) => FLAGGER_GROUPS.find((group) => group.id === groupId)?.slugs ?? [],
)
