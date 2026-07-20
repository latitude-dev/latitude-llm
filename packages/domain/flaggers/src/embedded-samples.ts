import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import type { FlaggerStrategy } from "./flagger-strategies/types.ts"

/**
 * Taxonomy naming prompts paste foreign conversation transcripts into the
 * evaluated agent's user message ("Samples:…"). User-centric flaggers
 * (frustration, jailbreaking) read that pasted wording as if it were the
 * naming agent's own user and systematically false-positive.
 *
 * Assistant-centric flaggers still run — they judge the naming model's own
 * JSON/name output, which is what dogfooding taxonomy is for.
 */
const TAXONOMY_SAMPLE_EMBEDDING_TAGS: readonly string[] = [
  ...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes,
  ...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster,
]

export const embedsTaxonomyConversationSamples = (tags: readonly string[]): boolean =>
  tags.some((tag) => TAXONOMY_SAMPLE_EMBEDDING_TAGS.includes(tag))

export const isUserCentricFlaggerStrategy = (strategy: FlaggerStrategy): boolean =>
  strategy.classifiesAssistantResponseOnly === false

export const shouldSkipUserCentricFlaggerForEmbeddedSamples = (
  strategy: FlaggerStrategy,
  tags: readonly string[],
): boolean => isUserCentricFlaggerStrategy(strategy) && embedsTaxonomyConversationSamples(tags)
