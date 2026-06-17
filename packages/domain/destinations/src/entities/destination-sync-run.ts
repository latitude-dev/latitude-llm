import {
  type DestinationSyncRunId,
  destinationIdSchema,
  destinationSyncRunIdSchema,
  generateId,
  organizationIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { destinationSourceSchema } from "./destination-source.ts"

export const DESTINATION_SYNC_RUN_STATUSES = ["succeeded", "failed"] as const
export const destinationSyncRunStatusSchema = z.enum(DESTINATION_SYNC_RUN_STATUSES)
export type DestinationSyncRunStatus = z.infer<typeof destinationSyncRunStatusSchema>

/** What scheduled the run: the live sweep, or a user-initiated historical backfill. */
export const DESTINATION_SYNC_RUN_TRIGGERS = ["live", "backfill"] as const
export const destinationSyncRunTriggerSchema = z.enum(DESTINATION_SYNC_RUN_TRIGGERS)
export type DestinationSyncRunTrigger = z.infer<typeof destinationSyncRunTriggerSchema>

export const destinationSyncRunSchema = z.object({
  id: destinationSyncRunIdSchema,
  organizationId: organizationIdSchema,
  destinationId: destinationIdSchema,
  /** Which source this run synced — one row per `(destination, source, run)`. */
  source: destinationSourceSchema,
  /** Live sweep run vs. user-initiated backfill window; defaults to `live`. */
  trigger: destinationSyncRunTriggerSchema.default("live"),
  windowStart: z.date(),
  windowEnd: z.date(),
  status: destinationSyncRunStatusSchema,
  recordsRead: z.number().int().min(0),
  eventsSent: z.number().int().min(0),
  /** Events removed by the oversized-event truncate-then-drop policy. */
  eventsDropped: z.number().int().min(0),
  /** Sanitized: HTTP status + our error taxonomy, never upstream response bodies. */
  error: z.string().nullable(),
  startedAt: z.date(),
  finishedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DestinationSyncRun = z.infer<typeof destinationSyncRunSchema>

export const createDestinationSyncRun = (
  params: Omit<DestinationSyncRun, "id" | "trigger" | "createdAt" | "updatedAt"> & {
    id?: DestinationSyncRunId | undefined
    trigger?: DestinationSyncRunTrigger | undefined
  },
): DestinationSyncRun => {
  const now = new Date()
  return destinationSyncRunSchema.parse({
    ...params,
    id: params.id ?? generateId<"DestinationSyncRunId">(),
    createdAt: now,
    updatedAt: now,
  })
}
