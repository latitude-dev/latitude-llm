import type { CryptoError } from "@repo/utils"
import { Effect } from "effect"
import type { FlaggerConversation } from "../conversation.ts"
import type {
  DeterministicFlaggerFindingRead,
  FlaggerFinding,
  FlaggerFindingScope,
} from "../entities/flagger-finding.ts"
import { unreadableDeterministicFlaggerFindingRead } from "../entities/flagger-finding.ts"
import type { SessionHint, SessionHintKind } from "../hints/types.ts"

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
  "bluffing",
  "pii-leakage",
  "incompletion",
  "tool-call-errors",
  "output-schema-validation",
  "empty-response",
  "low-cache-hit-rate",
  "task-failure",
] as const

export type FlaggerSlug = (typeof FLAGGER_STRATEGY_SLUGS)[number]

export type DetectionResult =
  | { readonly kind: "matched"; readonly feedback: string; readonly messageIndex?: number | undefined }
  | { readonly kind: "unmatched" }

export interface FlaggerAnnotatorContext {
  readonly name: string
  readonly description: string
  readonly instructions: string
}

export type FlaggerDisplayDetails = Pick<FlaggerAnnotatorContext, "name" | "description">

export type FlaggerSuppressor = string | { readonly slug: string; readonly whenHintedBy: readonly SessionHintKind[] }

export const suppressorSlug = (suppressor: FlaggerSuppressor): string =>
  typeof suppressor === "string" ? suppressor : suppressor.slug

export interface FlaggerStrategy {
  hasRequiredContext(conversation: FlaggerConversation): boolean

  detectDeterministically?(conversation: FlaggerConversation): DetectionResult

  readDeterministically?(input: {
    readonly scope: FlaggerFindingScope
    readonly conversation: FlaggerConversation
  }): Effect.Effect<DeterministicFlaggerFindingRead, CryptoError>

  selectDeterministicDiscoveryFinding?(findings: readonly FlaggerFinding[]): FlaggerFinding | null

  buildSystemPrompt?(conversation: FlaggerConversation): string

  buildPrompt?(conversation: FlaggerConversation): string

  readonly annotator?: FlaggerAnnotatorContext

  readonly details?: FlaggerDisplayDetails

  /**
   * Marks a strategy whose classifier answers with a structured verdict instead
   * of a matched/unmatched detection. The classifier builds the matching
   * generation schema and output contract for each one, and only the verdicts
   * that propose an annotation go through the adversarial review. Absent means
   * the ordinary detection contract.
   *
   * The two Safety contracts are separate because their fields are: injection
   * judges an attack and the assistant's response to it, while PII judges who
   * authored the personal data.
   */
  readonly verdictContract?: "taskOutcome" | "safetyInjection" | "safetyPii"

  /**
   * Whether this strategy classifies ONLY the evaluated agent's own assistant
   * response. When `true` (the default when omitted), the classifier and
   * annotation reviewer receive assistant-only targeting guidance that tells
   * them to treat user / tool / quoted content as source material and never
   * flag it (e.g. refusal, laziness, forgetting — issues that live in the
   * assistant's output).
   *
   * Set to `false` for strategies that judge user-authored or injected input
   * content (e.g. frustration, jailbreaking, nsfw). For those, the assistant-only
   * guidance would suppress every true match, so they instead get nested-content
   * guidance that still ignores material the agent was merely asked to analyze
   * without restricting the judgement to the assistant response.
   */
  readonly classifiesAssistantResponseOnly?: boolean

  /**
   * Strategies whose outcome makes this strategy non-applicable for the same
   * session. A bare slug triggers on the suppressor's deterministic `matched`
   * or any `hinted` outcome; `{ slug, whenHintedBy }` restricts the hinted
   * case to the listed suppressor hint kinds (a deterministic match always
   * triggers) — use it when some of the suppressor's hints are weak escalation
   * leads rather than direct evidence of its failure mode. When a suppressor
   * triggers, this strategy is skipped entirely (no det check, no LLM
   * classification) and the use-case emits a `suppressed` decision.
   *
   * Suppressors MUST run in phase 1 (i.e. have no `suppressedBy` themselves)
   * to keep the dependency graph acyclic; `whenHintedBy` kinds must be
   * declared in the suppressor's `hintKinds`. Both are validated at load.
   */
  readonly suppressedBy?: readonly FlaggerSuppressor[]

  /**
   * Negative hint kinds that escalate an `unmatched` session to `hinted`
   * (LLM pass, rate-limited only — never sampled).
   */
  readonly hintKinds?: readonly SessionHintKind[]

  /** Overrides the default any-of-`hintKinds` check. */
  isHintedBy?(hints: readonly SessionHint[], conversation: FlaggerConversation): boolean

  /**
   * Structural gate on an LLM classification match, enforced in code after
   * parsing and before the adversarial review. Return `false` to discard the
   * match — e.g. when the cited `messageIndex` does not satisfy the strategy's
   * evidence requirements. Prompt guidance alone cannot guarantee this.
   */
  validateMatch?(
    conversation: FlaggerConversation,
    result: { readonly feedback?: string | undefined; readonly messageIndex?: number | undefined },
  ): boolean
}

export interface LlmCapableFlaggerStrategy extends FlaggerStrategy {
  buildSystemPrompt(conversation: FlaggerConversation): string
  buildPrompt(conversation: FlaggerConversation): string
  readonly annotator: FlaggerAnnotatorContext
}

export const readDeterministicFlaggerFindings = (
  strategy: FlaggerStrategy,
  input: {
    readonly scope: FlaggerFindingScope
    readonly conversation: FlaggerConversation
  },
): Effect.Effect<DeterministicFlaggerFindingRead, CryptoError> => {
  if (!strategy.readDeterministically || !strategy.hasRequiredContext(input.conversation)) {
    return Effect.succeed(unreadableDeterministicFlaggerFindingRead)
  }
  return strategy.readDeterministically(input)
}
