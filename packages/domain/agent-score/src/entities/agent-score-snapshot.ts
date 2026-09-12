import { type OrganizationId, type ProjectId, SCORE_DIMENSIONS } from "@domain/shared"
import { z } from "zod"

const scoreValueSchema = z.number().min(0).max(100)

export const scoreIntervalSchema = z
  .object({ lower: scoreValueSchema, upper: scoreValueSchema })
  .refine((interval) => interval.lower <= interval.upper, { message: "an interval must not be inverted" })
export type ScoreInterval = z.infer<typeof scoreIntervalSchema>

export const dimensionSnapshotSchema = z.object({
  score: scoreValueSchema,
  interval: scoreIntervalSchema,
})
export type DimensionSnapshot = z.infer<typeof dimensionSnapshotSchema>

/**
 * One immutable daily record of a project's Agent Score.
 *
 * Scores and nothing else. No sessions, metrics, signals, causes, coverage or model inputs: those
 * are resolved from the live window when somebody asks, because new evidence can arrive after a
 * snapshot is written and a stored decomposition would go quietly stale while still looking precise.
 * What is here is what a trend chart needs and what a reader must be told to interpret a number: the
 * version that produced it, the window it covers, and how much traffic was in that window.
 */
export const agentScoreSnapshotSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  /** UTC date, `YYYY-MM-DD`. One row per project per date, and never rewritten. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scoringVersion: z.string().min(1),
  windowDays: z.number().int().positive(),
  eligibleSessionCount: z.number().int().nonnegative(),
  score: scoreValueSchema,
  interval: scoreIntervalSchema,
  dimensions: z.record(z.enum(SCORE_DIMENSIONS), dimensionSnapshotSchema),
  /** The composite the policy rule allowed, when one was applied. Kept apart from the weighted mean. */
  policyCap: scoreValueSchema.optional(),
  createdAt: z.date(),
})
export type AgentScoreSnapshot = z.infer<typeof agentScoreSnapshotSchema>

export interface AgentScoreSnapshotIdentity {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly date: string
}

/** The UTC date a cutoff belongs to, which is the key a snapshot is filed and looked up under. */
export const utcDateOf = (at: Date): string => at.toISOString().slice(0, 10)
