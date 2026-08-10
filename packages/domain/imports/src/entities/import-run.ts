import { z } from "zod"
import { IMPORT_RUN_HISTORY_LIMIT } from "../constants.ts"
import { importCursorSchema, importStatsSchema } from "./import-source.ts"

export const IMPORT_RUN_STATUSES = ["succeeded", "failed"] as const
export const importRunStatusSchema = z.enum(IMPORT_RUN_STATUSES)
export type ImportRunStatus = z.infer<typeof importRunStatusSchema>

/** The cursor span a page covered: where it started, and where it left off. */
const importRunCursorSchema = z.object({
  start: importCursorSchema.nullable(),
  end: importCursorSchema.nullable(),
})

/**
 * One processed page, kept on the job for post-mortem: which cursor the page covered,
 * what it produced, and why it failed. Carries no id or job id — the job holds both —
 * and no window of its own, since the cursor names the window the page read.
 */
export const importRunSchema = z.object({
  status: importRunStatusSchema,
  cursor: importRunCursorSchema,
  stats: importStatsSchema,
  error: z.string().nullable(),
  // Coerced because the history is persisted as jsonb, which hands dates back as ISO strings.
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date(),
})
export type ImportRun = z.infer<typeof importRunSchema>

/** Newest first, bounded. Pages are sequential, so this is a plain unshift-and-truncate. */
export const importRunHistorySchema = z.array(importRunSchema).max(IMPORT_RUN_HISTORY_LIMIT).readonly()

export const appendImportRun = (history: readonly ImportRun[], run: ImportRun): readonly ImportRun[] =>
  [run, ...history].slice(0, IMPORT_RUN_HISTORY_LIMIT)
