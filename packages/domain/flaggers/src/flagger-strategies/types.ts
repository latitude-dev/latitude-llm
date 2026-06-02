import type { TraceDetail } from "@domain/spans"

export const FLAGGER_STRATEGY_SLUGS = [
  "frustration",
  "nsfw",
  "refusal",
  "laziness",
  "jailbreaking",
  "forgetting",
  // Frozen slug (historical typo) — persisted in DB + exposed as a public API/SDK/MCP key.
  // Do NOT rename. Display this flagger as "Thrashing" in any UI / prompt text.
  "trashing",
  "tool-call-errors",
  "output-schema-validation",
  "empty-response",
] as const

export type FlaggerSlug = (typeof FLAGGER_STRATEGY_SLUGS)[number]

export type DetectionResult =
  | { readonly kind: "matched"; readonly feedback: string; readonly messageIndex?: number | undefined }
  | { readonly kind: "no-match" }
  | { readonly kind: "ambiguous" }

export interface FlaggerAnnotatorContext {
  readonly name: string
  readonly description: string
  readonly instructions: string
}

export type FlaggerDisplayDetails = Pick<FlaggerAnnotatorContext, "name" | "description">

export interface FlaggerStrategy {
  hasRequiredContext(trace: TraceDetail): boolean

  detectDeterministically?(trace: TraceDetail): DetectionResult

  buildSystemPrompt?(trace: TraceDetail): string

  buildPrompt?(trace: TraceDetail): string

  readonly annotator?: FlaggerAnnotatorContext

  readonly details?: FlaggerDisplayDetails

  /**
   * Whether this strategy classifies ONLY the evaluated agent's own assistant
   * response. When `true` (the default when omitted), the classifier and
   * annotation reviewer receive assistant-only targeting guidance that tells
   * them to treat user / tool / quoted content as source material and never
   * flag it (e.g. refusal, laziness, forgetting — issues that live in the
   * assistant's output).
   *
   * Set to `false` for strategies that judge user-authored or injected input
   * content (e.g. frustration judges the user's wording, jailbreaking judges
   * user/tool injection attempts). For those, the assistant-only guidance would
   * suppress every true match, so they instead get nested-content guidance that
   * still ignores material the agent was merely asked to analyze without
   * restricting the judgement to the assistant response.
   */
  readonly classifiesAssistantResponseOnly?: boolean

  /**
   * Slugs of strategies whose deterministic `matched` or `ambiguous` outcome makes
   * this strategy non-applicable for the same trace. When any listed suppressor
   * triggers, this strategy is skipped entirely (no det check, no LLM enqueue) and
   * the use-case emits a `suppressed` decision tagged with the suppressor.
   *
   * Strategies listed here MUST run in phase 1 (i.e. have no `suppressedBy` themselves)
   * to keep the dependency graph acyclic.
   */
  readonly suppressedBy?: readonly string[]
}

export interface LlmCapableFlaggerStrategy extends FlaggerStrategy {
  buildSystemPrompt(trace: TraceDetail): string
  buildPrompt(trace: TraceDetail): string
  readonly annotator: FlaggerAnnotatorContext
}
