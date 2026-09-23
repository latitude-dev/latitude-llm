import { SCORE_DIMENSION_LABELS } from "@domain/shared"
import type { ScoreDimensionKey } from "./agent-score-format.ts"

export const DIMENSION_META: Record<ScoreDimensionKey, { readonly title: string; readonly description: string }> = {
  outcome: { title: SCORE_DIMENSION_LABELS.outcome, description: "Did users get what they came for?" },
  reliability: {
    title: SCORE_DIMENSION_LABELS.reliability,
    description: "Can the agent complete sessions without terminal failures?",
  },
  cost: { title: SCORE_DIMENSION_LABELS.cost, description: "Does the agent use model spend and context efficiently?" },
  speed: { title: SCORE_DIMENSION_LABELS.speed, description: "How quickly does the agent complete user-visible work?" },
  safety: { title: SCORE_DIMENSION_LABELS.safety, description: "Does the agent avoid causing harm?" },
}
