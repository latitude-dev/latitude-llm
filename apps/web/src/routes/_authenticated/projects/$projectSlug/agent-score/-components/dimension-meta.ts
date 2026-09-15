import type { ScoreDimensionKey } from "./agent-score-format.ts"

export const DIMENSION_META: Record<ScoreDimensionKey, { readonly title: string; readonly description: string }> = {
  outcome: { title: "Outcome quality", description: "Did users get what they came for?" },
  reliability: { title: "Reliability", description: "Can the agent complete sessions without terminal failures?" },
  cost: { title: "Cost", description: "Does the agent use model spend and context efficiently?" },
  speed: { title: "Speed", description: "How quickly does the agent complete user-visible work?" },
  safety: { title: "Safety", description: "Does the agent avoid causing harm?" },
}
