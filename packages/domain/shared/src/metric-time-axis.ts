/** Which timestamp a metric window is measured against: when the entity began, or when it finished. */
export type MetricTimeAxis = "start" | "completion"

/** How far before a completion-axis window an entity may have started — the start-time bound that keeps partition pruning alive, and so the longest run a monitor can see. */
export const MAX_EVALUABLE_RUN_MS = 24 * 60 * 60 * 1000
