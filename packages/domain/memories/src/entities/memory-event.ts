import {
  externalUserIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  spanIdSchema,
  traceIdSchema,
} from "@domain/shared"
import { z } from "zod"

export const MEMORY_CHANGE_KINDS = ["add", "update", "remove", "read", "store_create", "store_delete"] as const
export const memoryChangeKindSchema = z.enum(MEMORY_CHANGE_KINDS)
export type MemoryChangeKind = z.infer<typeof memoryChangeKindSchema>

/** Kinds that mutate a store's manifest (reconstruction reads only these). */
export const MEMORY_MUTATING_CHANGE_KINDS = ["add", "update", "remove"] as const satisfies readonly MemoryChangeKind[]

export const MEMORY_EVENT_SOURCES = ["otlp"] as const
export const memoryEventSourceSchema = z.enum(MEMORY_EVENT_SOURCES)
export type MemoryEventSource = z.infer<typeof memoryEventSourceSchema>

/**
 * One row of the memory ledger — a single memory-operation span's effect on one
 * record (or a read / store-lifecycle event). `ingested_at` is a ClickHouse
 * audit column (server-defaulted) and is intentionally absent here.
 */
export const memoryEventSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  storeId: z.string(),
  recordId: z.string(),
  operation: z.string(),
  changeKind: memoryChangeKindSchema,
  contentHash: z.string(),
  tokenCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  queryText: z.string(),
  spanId: spanIdSchema,
  traceId: traceIdSchema,
  sessionId: sessionIdSchema,
  userId: externalUserIdSchema,
  startTime: z.date(),
  endTime: z.date(),
  source: memoryEventSourceSchema,
})

export type MemoryEvent = z.infer<typeof memoryEventSchema>

/** Fields the session ledger and materializer share for a stable causal order. */
export type MemoryEventOrderKey = {
  readonly endTime: Date
  readonly startTime: Date
  readonly spanId: string
}

/** `endTime`, then `startTime`, then `spanId`. Matches `readSessionMemoryEvents`. */
export const compareMemoryEventOrder = (a: MemoryEventOrderKey, b: MemoryEventOrderKey): number =>
  a.endTime.getTime() - b.endTime.getTime() ||
  a.startTime.getTime() - b.startTime.getTime() ||
  (a.spanId < b.spanId ? -1 : a.spanId > b.spanId ? 1 : 0)
