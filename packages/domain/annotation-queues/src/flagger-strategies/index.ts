import { createDefaultStrategy, DEFAULT_QUEUE_DEFINITIONS } from "./default-strategy.ts"
import { frustrationStrategy } from "./frustration.ts"
import { jailbreakingStrategy } from "./jailbreaking.ts"
import { lazinessStrategy } from "./laziness.ts"
import { nsfwStrategy } from "./nsfw.ts"
import { refusalStrategy } from "./refusal.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Strategy Registry
// ---------------------------------------------------------------------------

const STRATEGY_REGISTRY: Record<string, QueueStrategy> = {
  frustration: frustrationStrategy,
  nsfw: nsfwStrategy,
  refusal: refusalStrategy,
  laziness: lazinessStrategy,
  jailbreaking: jailbreakingStrategy,
  forgetting: createDefaultStrategy("forgetting", DEFAULT_QUEUE_DEFINITIONS.forgetting),
  trashing: createDefaultStrategy("trashing", DEFAULT_QUEUE_DEFINITIONS.trashing),
}

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

// Export strategies for testing
export { frustrationStrategy, nsfwStrategy, refusalStrategy, lazinessStrategy, jailbreakingStrategy }

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
