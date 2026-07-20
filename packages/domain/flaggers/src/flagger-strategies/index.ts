import { bluffingStrategy } from "./bluffing.ts"
import { emptyResponseStrategy } from "./empty-response.ts"
import { forgettingStrategy } from "./forgetting.ts"
import { frustrationStrategy } from "./frustration.ts"
import { incompletionStrategy } from "./incompletion.ts"
import { jailbreakingStrategy } from "./jailbreaking.ts"
import { lazinessStrategy } from "./laziness.ts"
import { lowCacheHitRateStrategy } from "./low-cache-hit-rate.ts"
import { nsfwStrategy } from "./nsfw.ts"
import { outputSchemaValidationStrategy } from "./output-schema-validation.ts"
import { piiLeakageStrategy } from "./pii-leakage.ts"
import { refusalStrategy } from "./refusal.ts"
import { toolCallErrorsStrategy } from "./tool-call-errors.ts"
import { trashingStrategy } from "./trashing.ts"
import {
  FLAGGER_STRATEGY_SLUGS,
  type FlaggerSlug,
  type FlaggerStrategy,
  type LlmCapableFlaggerStrategy,
  suppressorSlug,
} from "./types.ts"

const STRATEGY_REGISTRY = {
  // LLM-capable
  frustration: frustrationStrategy,
  nsfw: nsfwStrategy,
  refusal: refusalStrategy,
  laziness: lazinessStrategy,
  jailbreaking: jailbreakingStrategy,
  forgetting: forgettingStrategy,
  // Slug "trashing" is a frozen identifier (typo); the user-facing name is "Thrashing". Do not rename.
  trashing: trashingStrategy,
  bluffing: bluffingStrategy,
  "pii-leakage": piiLeakageStrategy,
  incompletion: incompletionStrategy,

  // Deterministic-only
  "tool-call-errors": toolCallErrorsStrategy,
  "output-schema-validation": outputSchemaValidationStrategy,
  "empty-response": emptyResponseStrategy,
  "low-cache-hit-rate": lowCacheHitRateStrategy,
} satisfies Record<FlaggerSlug, FlaggerStrategy>

// Validates the suppression graph (one level deep, known suppressors,
// whenHintedBy ⊆ suppressor hintKinds). Called from tests, NOT at module load —
// a top-level IIFE would be an import side effect that pins the whole registry
// (every strategy's multi-KB system prompt) into any client bundle that imports
// this package, defeating tree-shaking.
export function assertFlaggerRegistryValid(): void {
  for (const [slug, strategy] of Object.entries(STRATEGY_REGISTRY)) {
    const suppressors = strategy.suppressedBy
    if (!suppressors || suppressors.length === 0) continue
    for (const suppressor of suppressors) {
      const targetSlug = suppressorSlug(suppressor)
      const target = STRATEGY_REGISTRY[targetSlug as FlaggerSlug]
      if (!target) {
        throw new Error(
          `Invalid flagger strategy registry: "${slug}" lists unknown suppressor "${targetSlug}" in suppressedBy`,
        )
      }
      if (target.suppressedBy && target.suppressedBy.length > 0) {
        throw new Error(
          `Invalid flagger strategy registry: "${slug}" is suppressed by "${targetSlug}", but "${targetSlug}" itself has suppressedBy — suppressors must run in phase 1 (no transitive suppression)`,
        )
      }
      if (typeof suppressor !== "string") {
        const declared = new Set(target.hintKinds ?? [])
        for (const kind of suppressor.whenHintedBy) {
          if (!declared.has(kind)) {
            throw new Error(
              `Invalid flagger strategy registry: "${slug}" requires suppressor hint "${kind}", which "${targetSlug}" does not declare in hintKinds`,
            )
          }
        }
      }
    }
  }
}

export function getFlaggerStrategy(flaggerSlug: string): FlaggerStrategy | null {
  return STRATEGY_REGISTRY[flaggerSlug as FlaggerSlug] ?? null
}

export function hasFlaggerStrategy(flaggerSlug: string): boolean {
  return flaggerSlug in STRATEGY_REGISTRY
}

export function listFlaggerStrategySlugs(): readonly FlaggerSlug[] {
  return FLAGGER_STRATEGY_SLUGS
}

export function isLlmCapableStrategy(strategy: FlaggerStrategy): strategy is LlmCapableFlaggerStrategy {
  return (
    typeof strategy.buildSystemPrompt === "function" &&
    typeof strategy.buildPrompt === "function" &&
    strategy.annotator !== undefined
  )
}

export {
  bluffingStrategy,
  emptyResponseStrategy,
  forgettingStrategy,
  frustrationStrategy,
  jailbreakingStrategy,
  lazinessStrategy,
  lowCacheHitRateStrategy,
  nsfwStrategy,
  outputSchemaValidationStrategy,
  piiLeakageStrategy,
  refusalStrategy,
  toolCallErrorsStrategy,
  trashingStrategy,
}

export { extractWorkSignals, getStageWorkSignals, type WorkSignals } from "./laziness.ts"
export {
  type ConversationStage,
  extractConversationStages,
  rankStagesByRefusalLikelihood,
  scoreRefusalLikelihood,
} from "./refusal.ts"
export {
  extractUserTextMessages,
  MAX_EXCERPT_LENGTH,
  MAX_SNIPPET_EXCERPT_LENGTH,
  MAX_STAGES_PER_PROMPT,
  MAX_SUSPICIOUS_SNIPPETS,
  type SuspiciousSnippet,
  truncateExcerpt,
} from "./shared.ts"
export {
  type DetectionResult,
  type FlaggerSlug,
  type FlaggerStrategy,
  type FlaggerSuppressor,
  suppressorSlug,
} from "./types.ts"
