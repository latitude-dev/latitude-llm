import type { FlaggerConversation } from "../conversation.ts"
import { detectLowCacheHitRateFlagger } from "../helpers.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

/**
 * Deterministic-only strategy. Flags large multi-turn traces where prompt
 * caching is active but the cache hit rate is unexpectedly low — the signature
 * of a broken cache implementation that silently multiplies token cost. Reads
 * the trace's aggregated token counts; never calls an LLM.
 */
export const lowCacheHitRateStrategy: FlaggerStrategy = {
  details: {
    name: "Low cache hit rate",
    description:
      "Flags large multi-turn traces where caching is active but fewer than 30% of input tokens were served from cache, signaling broken caching, without calling an LLM.",
  },

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return conversation.tokensInput + conversation.tokensCacheRead + conversation.tokensCacheCreate > 0
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const result = detectLowCacheHitRateFlagger(conversation)
    return result.matched ? { kind: "matched", feedback: result.feedback } : { kind: "unmatched" }
  },
}
