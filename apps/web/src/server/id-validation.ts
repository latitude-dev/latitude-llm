import { z } from "zod"

// Trace/span ids are always lowercase hex; ClickHouse binds them as FixedString(32)/FixedString(16)
// (byte-sized), so `.length(N)` (UTF-16 code units) alone would let a same-length non-ASCII value through.
export const traceIdSchema = z.string().regex(/^[0-9a-f]{32}$/, "must be a 32-character hex string")
export const spanIdSchema = z.string().regex(/^[0-9a-f]{16}$/, "must be a 16-character hex string")
