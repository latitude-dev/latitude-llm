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

export const destinationSyncRunSchema = z.object({
  id: destinationSyncRunIdSchema,
  organizationId: organizationIdSchema,
  destinationId: destinationIdSchema,
  /** Which source this run synced — one row per `(destination, source, run)`. */
  source: destinationSourceSchema,
  windowStart: z.date(),
  windowEnd: z.date(),
  status: destinationSyncRunStatusSchema,
  spansRead: z.number().int().min(0),
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
  params: Omit<DestinationSyncRun, "id" | "createdAt" | "updatedAt"> & {
    id?: DestinationSyncRunId | undefined
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
