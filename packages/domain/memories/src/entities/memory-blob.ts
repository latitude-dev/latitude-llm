import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * A content-addressed record body (git's object store). Dedup is per-org, keyed
 * by `contentHash`. `content` is stored inline; `contentFileKey` is reserved for
 * a future object-storage overflow (empty in Phase 1). `createdAt` is a
 * ClickHouse audit column (server-defaulted) and is intentionally absent here.
 */
export const memoryBlobSchema = z.object({
  organizationId: organizationIdSchema,
  contentHash: z.string(),
  content: z.string(),
  contentFileKey: z.string(),
  byteSize: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
})

export type MemoryBlob = z.infer<typeof memoryBlobSchema>
