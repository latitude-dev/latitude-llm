import type { TraceDetail } from "@domain/spans"

export const FLAGGER_STRATEGY_SLUGS = [
  "frustration",
  "nsfw",
  "refusal",
  "laziness",
  "jailbreaking",
  "forgetting",
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
