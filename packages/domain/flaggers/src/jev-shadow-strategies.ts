import {
  JEV_SHADOW_FRUSTRATION_QUESTION_VERSION,
  JEV_SHADOW_FRUSTRATION_THRESHOLD,
  JEV_SHADOW_REFUSAL_QUESTION_VERSION,
  JEV_SHADOW_REFUSAL_THRESHOLD,
  type JEV_SHADOW_STRATEGY_SLUGS,
} from "./constants.ts"
import type { JevShadowQuestion } from "./ports/jev-shadow-decision-provider.ts"

export type JevShadowStrategySlug = (typeof JEV_SHADOW_STRATEGY_SLUGS)[number]

export interface JevShadowStrategy {
  readonly slug: JevShadowStrategySlug
  readonly threshold: number
  readonly question: JevShadowQuestion
}

const createQuestion = (input: { readonly id: string; readonly version: string; readonly prompt: string }) => ({
  ...input,
})

export const JEV_SHADOW_STRATEGIES: Readonly<Record<JevShadowStrategySlug, JevShadowStrategy>> = {
  frustration: {
    slug: "frustration",
    threshold: JEV_SHADOW_FRUSTRATION_THRESHOLD,
    question: createQuestion({
      id: "flagger.frustration",
      version: JEV_SHADOW_FRUSTRATION_QUESTION_VERSION,
      prompt: "What is the probability that the user's wording shows clear frustration with the assistant?",
    }),
  },
  refusal: {
    slug: "refusal",
    threshold: JEV_SHADOW_REFUSAL_THRESHOLD,
    question: createQuestion({
      id: "flagger.refusal",
      version: JEV_SHADOW_REFUSAL_QUESTION_VERSION,
      prompt: "What is the probability that the assistant incorrectly refused or deflected an allowed request?",
    }),
  },
}

export const getJevShadowStrategy = (slug: string): JevShadowStrategy | null =>
  JEV_SHADOW_STRATEGIES[slug as JevShadowStrategySlug] ?? null
