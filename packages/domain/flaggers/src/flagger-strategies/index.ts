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
import {
  FLAGGER_STRATEGY_SLUGS,
  type FlaggerSlug,
  type FlaggerStrategy,
  type LlmCapableFlaggerStrategy,
} from "./types.ts"

const STRATEGY_REGISTRY = {
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
} satisfies Record<FlaggerSlug, FlaggerStrategy>

;(() => {
  for (const [slug, strategy] of Object.entries(STRATEGY_REGISTRY)) {
    const suppressors = strategy.suppressedBy
    if (!suppressors || suppressors.length === 0) continue
    for (const suppressor of suppressors) {
      const target = STRATEGY_REGISTRY[suppressor as FlaggerSlug]
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
export type { DetectionResult, FlaggerSlug, FlaggerStrategy } from "./types.ts"
