import type { Evaluation } from "@domain/evaluations"
import type { SignalOccurrenceBucket } from "@domain/scores"
import { cuidSchema } from "@domain/shared"
import { z } from "zod"
import type { SIGNAL_PRIORITY_GROUPS } from "../constants.ts"
import type { SignalPriority, SignalSource } from "../entities/signal.ts"

export const signalsLifecycleGroupSchema = z.enum(["active", "archived"])
export type SignalsLifecycleGroup = z.infer<typeof signalsLifecycleGroupSchema>

export const signalsSortFieldSchema = z.enum(["lastSeen", "occurrences", "affectedSessions", "state"])
export type SignalsSortField = z.infer<typeof signalsSortFieldSchema>

export const UNASSIGNED_FILTER = "unassigned" as const

export const signalAssigneeFilterSchema = z.union([cuidSchema, z.literal(UNASSIGNED_FILTER)])
export type SignalAssigneeFilter = z.infer<typeof signalAssigneeFilterSchema>

export type SignalPriorityGroup = (typeof SIGNAL_PRIORITY_GROUPS)[number]

export const signalsSortDirectionSchema = z.enum(["asc", "desc"])
export type SignalsSortDirection = z.infer<typeof signalsSortDirectionSchema>

export const signalsTimeRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
})

export const signalSearchSchema = z.object({
  query: z.string().min(1),
  normalizedEmbedding: z.array(z.number()),
})

export interface SignalListAnalyticsCounts {
  readonly newSignals: number
  readonly escalatingSignals: number
  readonly ongoingSignals: number
  readonly regressedSignals: number
  readonly resolvedSignals: number
  readonly seenOccurrences: number
}

export interface SignalListAnalytics {
  readonly counts: SignalListAnalyticsCounts
  readonly histogram: readonly SignalOccurrenceBucket[]
  readonly histogramBucketSeconds: number
  readonly totalSessions: number
}

export interface SignalListItem {
  readonly id: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly source: SignalSource
  readonly states: readonly string[]
  readonly assigneeId: string | null
  readonly priority: SignalPriority | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly escalatedAt: Date | null
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly occurrences: number
  readonly similarityScore: number | null
  readonly affectedSessionsPercent: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly SignalOccurrenceBucket[]
  readonly evaluations: readonly Evaluation[]
  readonly tags: readonly string[]
}
