import { organizationIdSchema, projectIdSchema, sessionIdSchema, spanIdSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { memoryChangeKindSchema } from "./memory-event.ts"

/**
 * Latest mutating version of one record, upserted into the `memory_current`
 * projection (ReplacingMergeTree by `endTime`). One entry per mutating event;
 * `remove` entries are kept so the current-snapshot read can drop them.
 */
export const memoryCurrentEntrySchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  scope: z.string(),
  storeId: z.string(),
  recordId: z.string(),
  contentHash: z.string(),
  changeKind: memoryChangeKindSchema,
  tokenCount: z.number().int().nonnegative(),
  spanId: spanIdSchema,
  traceId: traceIdSchema,
  sessionId: sessionIdSchema,
  endTime: z.date(),
})

export type MemoryCurrentEntry = z.infer<typeof memoryCurrentEntrySchema>
