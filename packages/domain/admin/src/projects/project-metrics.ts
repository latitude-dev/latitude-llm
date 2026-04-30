import { z } from "zod"

/**
 * Per-day data point for the dual-axis "activity" chart at the top of
 * the backoffice project metrics panel. `traceCount` powers the bars,
 * `annotationCount` powers the line.
 */
export const projectMetricsActivityPointSchema = z.object({
  /** Bucket start at midnight UTC, ISO-8601. */
  bucketStart: z.string(),
  traceCount: z.number().int().nonnegative(),
  annotationCount: z.number().int().nonnegative(),
})
export type ProjectMetricsActivityPoint = z.infer<typeof projectMetricsActivityPointSchema>

/**
 * Per-day issue lifecycle composition. Every layer is a non-negative
 * count; their sum is the project's total known issues at the end of
 * that day. Reconstructed point-in-time from a snapshot + lifecycle
 * events — see `composeIssueLifecycleTimeline`.
 *
 * `ignored_at` issues are rolled into `resolved` since they're
 * semantically "out of the active pile" — we may add a fourth layer
 * later if staff want to distinguish them.
 */
export const projectIssueLifecyclePointSchema = z.object({
  bucketStart: z.string(),
  /** Not resolved/ignored, no evaluation linked. */
  untracked: z.number().int().nonnegative(),
  /** Not resolved/ignored, ≥1 evaluation linked (eval `archived_at` ignored per design). */
  tracked: z.number().int().nonnegative(),
  /** Resolved at any time, plus issues marked ignored. */
  resolved: z.number().int().nonnegative(),
})
export type ProjectIssueLifecyclePoint = z.infer<typeof projectIssueLifecyclePointSchema>

/**
 * One row of the "top issues" table. Ranked by `occurrences` descending
 * — same signal as the user-facing Issues page (count of `scores` rows
 * pointing at this issue within the window).
 */
export const projectTopIssueSchema = z.object({
  id: z.string(),
  name: z.string(),
  occurrences: z.number().int().nonnegative(),
  lastSeenAt: z.date(),
  /** Lifecycle state at request time, not over the window. */
  state: z.enum(["untracked", "tracked", "resolved"]),
})
export type ProjectTopIssue = z.infer<typeof projectTopIssueSchema>

export const projectMetricsSchema = z.object({
  /** Window anchor (now), echoed back so the client can label the chart axis. */
  windowEnd: z.date(),
  windowDays: z.number().int().positive(),
  activity: z.array(projectMetricsActivityPointSchema),
  issuesLifecycle: z.array(projectIssueLifecyclePointSchema),
  topIssues: z.array(projectTopIssueSchema),
})
export type ProjectMetrics = z.infer<typeof projectMetricsSchema>
