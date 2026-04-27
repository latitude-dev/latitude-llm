import { emptyResponseStrategy } from "./empty-response.ts"
import { forgettingStrategy } from "./forgetting.ts"
import { frustrationStrategy } from "./frustration.ts"
import { jailbreakingStrategy } from "./jailbreaking.ts"
import { lazinessStrategy } from "./laziness.ts"
import { nsfwStrategy } from "./nsfw.ts"
import { outputSchemaValidationStrategy } from "./output-schema-validation.ts"
import { refusalStrategy } from "./refusal.ts"
import { toolCallErrorsStrategy } from "./tool-call-errors.ts"
import { trashingStrategy } from "./trashing.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Strategy Registry
// ---------------------------------------------------------------------------
//
// Two kinds of strategies live in the same registry:
//   1. LLM-capable strategies — back a provisioned system queue (slug in
//      `SYSTEM_QUEUE_DEFINITIONS`); have both `buildSystemPrompt` and
//      `buildPrompt`. Deterministic `no-match`/`ambiguous` route to the
//      LLM workflow.
//   2. Deterministic-only strategies — no provisioned queue, no LLM prompts.
//      Only their `matched` branch produces output (direct score write with
//      `sourceId="SYSTEM"`). `no-match` is a no-op; they never return
//      `ambiguous`.
// ---------------------------------------------------------------------------

const STRATEGY_REGISTRY: Record<string, QueueStrategy> = {
  // LLM-capable
  frustration: frustrationStrategy,
  nsfw: nsfwStrategy,
  refusal: refusalStrategy,
  laziness: lazinessStrategy,
  jailbreaking: jailbreakingStrategy,
  forgetting: forgettingStrategy,
  trashing: trashingStrategy,

  // Deterministic-only
  "tool-call-errors": toolCallErrorsStrategy,
  "output-schema-validation": outputSchemaValidationStrategy,
  "empty-response": emptyResponseStrategy,
}

// Validate the suppressedBy dependency graph at module load. The two-phase
// fan-out in `processDeterministicFlaggersUseCase` requires every suppressor
// to live in phase 1 (no `suppressedBy` of its own) and to point at a real
// registered slug. A violation would cause silent miss-suppression at runtime,
// so fail loudly here instead.
;(() => {
  for (const [slug, strategy] of Object.entries(STRATEGY_REGISTRY)) {
    const suppressors = strategy.suppressedBy
    if (!suppressors || suppressors.length === 0) continue
    for (const suppressor of suppressors) {
      const target = STRATEGY_REGISTRY[suppressor]
      if (!target) {
        throw new Error(
          `Invalid flagger strategy registry: "${slug}" lists unknown suppressor "${suppressor}" in suppressedBy`,
        )
      }
      if (target.suppressedBy && target.suppressedBy.length > 0) {
        throw new Error(
          `Invalid flagger strategy registry: "${slug}" is suppressed by "${suppressor}", but "${suppressor}" itself has suppressedBy — suppressors must run in phase 1 (no transitive suppression)`,
        )
      }
    }
  }
})()

/**
 * Get the strategy for a queue slug.
 * Returns null for unknown slugs.
 */
export function getQueueStrategy(queueSlug: string): QueueStrategy | null {
  return STRATEGY_REGISTRY[queueSlug] ?? null
}

/**
 * Check if a queue slug has a registered strategy.
 */
export function hasQueueStrategy(queueSlug: string): boolean {
  return queueSlug in STRATEGY_REGISTRY
}

/**
 * List all queue slugs with registered strategies.
 */
export function listQueueStrategySlugs(): readonly string[] {
  return Object.keys(STRATEGY_REGISTRY)
}

/**
 * True when the strategy can run the LLM classification path (has both
 * `buildSystemPrompt` and `buildPrompt`). Deterministic-only strategies
 * cannot route to the LLM workflow.
 */
export function isLlmCapableStrategy(strategy: QueueStrategy): boolean {
  return typeof strategy.buildSystemPrompt === "function" && typeof strategy.buildPrompt === "function"
}

// Export strategies for testing
export {
  emptyResponseStrategy,
  forgettingStrategy,
  frustrationStrategy,
  jailbreakingStrategy,
  lazinessStrategy,
  nsfwStrategy,
  outputSchemaValidationStrategy,
  refusalStrategy,
  toolCallErrorsStrategy,
  trashingStrategy,
}

// Re-export laziness-specific ranking (collocated with laziness strategy)
export { extractWorkSignals, getStageWorkSignals, type WorkSignals } from "./laziness.ts"
// Re-export conversation stage types and helpers from refusal (their primary home)
export {
  type ConversationStage,
  extractConversationStages,
  rankStagesByRefusalLikelihood,
  scoreRefusalLikelihood,
} from "./refusal.ts"
// Re-export shared utilities and types (cross-strategy contracts)
export {
  extractUserTextMessages,
  MAX_EXCERPT_LENGTH,
  MAX_SNIPPET_EXCERPT_LENGTH,
  MAX_STAGES_PER_PROMPT,
  MAX_SUSPICIOUS_SNIPPETS,
  type SuspiciousSnippet,
  truncateExcerpt,
} from "./shared.ts"
// Re-export types
export type { DetectionResult, QueueStrategy } from "./types.ts"
