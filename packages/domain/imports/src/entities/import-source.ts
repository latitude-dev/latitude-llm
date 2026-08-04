import { z } from "zod"
import { IMPORT_HARD_MAX_TRACES, IMPORT_SOURCE_PAGE_SIZE_MAX } from "../constants.ts"
import {
  BRAINTRUST_REGION_DEFINITIONS,
  braintrustRegionSchema,
  isKnownImportBaseUrl,
  LANGFUSE_REGION_DEFINITIONS,
  LANGSMITH_REGION_DEFINITIONS,
  langfuseRegionSchema,
  langsmithRegionSchema,
} from "./import-region.ts"

export const IMPORT_SOURCES = ["langfuse", "langsmith", "braintrust"] as const
export const importSourceSchema = z.enum(IMPORT_SOURCES)
export type ImportSource = z.infer<typeof importSourceSchema>

export const langfuseCredentialsSchema = z.object({
  kind: z.literal("langfuse"),
  /** Which Langfuse Cloud deployment the keys belong to; the origin comes from our table. */
  region: langfuseRegionSchema,
  publicKey: z.string().min(1),
  secretKey: z.string().min(1),
})
export type LangfuseCredentials = z.infer<typeof langfuseCredentialsSchema>

export const langsmithCredentialsSchema = z.object({
  kind: z.literal("langsmith"),
  region: langsmithRegionSchema,
  apiKey: z.string().min(1),
  workspaceId: z.string().optional(),
})
export type LangsmithCredentials = z.infer<typeof langsmithCredentialsSchema>

export const braintrustCredentialsSchema = z.object({
  kind: z.literal("braintrust"),
  region: braintrustRegionSchema,
  apiKey: z.string().min(1),
})
export type BraintrustCredentials = z.infer<typeof braintrustCredentialsSchema>

export const importCredentialsSchema = z.discriminatedUnion("kind", [
  langfuseCredentialsSchema,
  langsmithCredentialsSchema,
  braintrustCredentialsSchema,
])
export type ImportCredentials = z.infer<typeof importCredentialsSchema>

/**
 * The only place a region becomes a URL. Every adapter request goes through here or through
 * the `sourceBaseUrl` this resolved into at confirmation, so no caller can name its own host.
 */
export const importSourceBaseUrl = (credentials: ImportCredentials): string => {
  switch (credentials.kind) {
    case "langfuse":
      return LANGFUSE_REGION_DEFINITIONS[credentials.region].baseUrl
    case "langsmith":
      return LANGSMITH_REGION_DEFINITIONS[credentials.region].baseUrl
    case "braintrust":
      return BRAINTRUST_REGION_DEFINITIONS[credentials.region].baseUrl
  }
}

/**
 * Opaque adapter pagination state within one window — each source defines its own
 * shape (Langfuse page numbers, LangSmith and Braintrust cursor tokens), so the
 * engine stores and returns it without interpreting it.
 */
const importSourceCursorSchema = z.record(z.string(), z.unknown())
export type ImportSourceCursor = z.infer<typeof importSourceCursorSchema>

/**
 * Where the import has got to. The engine reads the range as windows walking
 * backwards from `rangeTo`, so this is a window plus the adapter's position inside
 * it. Coerced dates because the cursor round-trips through jsonb.
 */
export const importCursorSchema = z.object({
  /** Exclusive upper bound of the window being read. Moves down as windows complete. */
  windowEnd: z.coerce.date(),
  /** Current window width; widens over empty stretches, resets once rows appear. */
  windowMs: z.number().int().positive(),
  source: importSourceCursorSchema.nullable(),
})
export type ImportCursor = z.infer<typeof importCursorSchema>

/**
 * Everything the engine needs to run the job, snapshotted at confirmation so a
 * later change to the limit constants — or to the org's plan usage — cannot alter
 * an in-flight import.
 */
export const importConfigSchema = z.object({
  sourceProjectId: z.string().min(1),
  sourceProjectName: z.string().min(1),
  /** The region the user picked, kept for the record and to bind a retry to the same one. */
  sourceRegion: z.string().min(1),
  /**
   * Where the engine sends every request for this job, resolved from the region at
   * confirmation. Gated on our own table, so a hand-edited row cannot redirect the worker.
   */
  sourceBaseUrl: z.string().refine(isKnownImportBaseUrl, "Unknown import source base URL"),
  sourcePageSize: z.number().int().min(1).max(IMPORT_SOURCE_PAGE_SIZE_MAX),
  rangeFrom: z.date(),
  rangeTo: z.date(),
  /** Trace ceiling the user accepted. One imported trace costs one credit, like an ingested one. */
  maxTraces: z.number().int().min(1).max(IMPORT_HARD_MAX_TRACES),
  sessionMetadataKey: z.string().optional(),
})
export type ImportConfig = z.infer<typeof importConfigSchema>

/**
 * The half of a config a dry run can be given. A preview runs before any job exists, so
 * there is no page size to honour and no project name to record — only the range the user
 * has selected, the ceiling they are considering, and the session key they typed.
 */
export const importPreviewConfigSchema = importConfigSchema.pick({
  rangeFrom: true,
  rangeTo: true,
  maxTraces: true,
  sessionMetadataKey: true,
})
export type ImportPreviewConfig = z.infer<typeof importPreviewConfigSchema>

/**
 * Counters for one page, and — summed — for the whole job. `tracesImported` counts root
 * spans, which is what makes it agree with billing: billing charges one credit per distinct
 * trace, and a trace has exactly one root however its spans are spread across pages.
 */
export const importStatsSchema = z.object({
  recordsFetched: z.number().int().min(0),
  tracesImported: z.number().int().min(0),
  spansImported: z.number().int().min(0),
  spansSkipped: z.number().int().min(0),
})
export type ImportStats = z.infer<typeof importStatsSchema>

export const defaultImportStats = (): ImportStats => ({
  recordsFetched: 0,
  tracesImported: 0,
  spansImported: 0,
  spansSkipped: 0,
})
