import { TRACE_DELETION_REQUESTER_TYPES, TRACE_DELETION_STATUSES, type TraceDeletionRequest } from "@domain/spans"
import { z } from "@hono/zod-openapi"
import { FilterSetSchema } from "../schemas.ts"

export const TraceDeletionSchema = z
  .object({
    id: z.string().describe("Trace deletion identifier. Use it to poll the deletion with `getTraceDeletion`."),
    status: z
      .enum(TRACE_DELETION_STATUSES)
      .describe(
        "`pending` until work starts, `running` while traces are being deleted, then `completed` or `failed`. Deletion is irreversible: traces deleted before a failure stay deleted.",
      ),
    filters: FilterSetSchema.describe(
      "The trace filter the deletion selects with, including any explicit trace ids as a `traceId` condition. Only traces that started before `createdAt` are deleted.",
    ),
    includeDatasetRows: z.boolean().describe("Whether dataset rows copied from the deleted traces are deleted too."),
    requestedBy: z
      .object({
        type: z
          .enum(TRACE_DELETION_REQUESTER_TYPES)
          .describe("`user` for a person, `api_key` for an API key, `staff` for Latitude support."),
        id: z.string().describe("Identifier of the user or API key that requested the deletion."),
      })
      .describe("Who requested the deletion."),
    matchedTraceCount: z
      .number()
      .int()
      .describe("Traces deleted so far. Final once `status` is `completed` or `failed`."),
    deletedRecordCount: z
      .number()
      .int()
      .describe(
        "Records deleted so far across the traces, their spans, and everything derived from them (scores, annotations, search indexes, session analyses).",
      ),
    error: z.string().nullable().describe("Why the deletion failed. `null` unless `status` is `failed`."),
    createdAt: z.string().describe("ISO-8601 time the deletion was requested."),
    startedAt: z.string().nullable().describe("ISO-8601 time work started, or `null` while pending."),
    completedAt: z
      .string()
      .nullable()
      .describe("ISO-8601 time the deletion completed or failed, or `null` while it is still in progress."),
  })
  .openapi("TraceDeletion")

export const toTraceDeletionResponse = (request: TraceDeletionRequest): z.infer<typeof TraceDeletionSchema> => ({
  id: request.id,
  status: request.status,
  filters: request.filters as z.infer<typeof FilterSetSchema>,
  includeDatasetRows: request.includeDatasetRows,
  requestedBy: request.requestedBy,
  matchedTraceCount: request.matchedTraceCount,
  deletedRecordCount: Object.values(request.deletedRowCounts).reduce((total, rows) => total + rows, 0),
  error: request.error,
  createdAt: request.createdAt.toISOString(),
  startedAt: request.startedAt?.toISOString() ?? null,
  completedAt: request.completedAt?.toISOString() ?? null,
})
