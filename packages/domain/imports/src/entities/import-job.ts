import type { EffectivePlanResolution } from "@domain/billing"
import {
  generateId,
  type ImportJobId,
  importJobIdSchema,
  type OrganizationId,
  organizationIdSchema,
  type ProjectId,
  projectIdSchema,
  type UserId,
} from "@domain/shared"
import { z } from "zod"
import { importRunHistorySchema } from "./import-run.ts"
import {
  defaultImportStats,
  type ImportCursor,
  importConfigSchema,
  importCredentialsSchema,
  importCursorSchema,
  importSourceSchema,
  importStatsSchema,
} from "./import-source.ts"

/**
 * `created` is the pre-flight state: the row exists but no worker knows about it yet.
 * `enqueueImportUseCase` is the only writer of `queued`, and it only accepts `created`,
 * so a job cannot be handed to the queue twice.
 */
export const IMPORT_STATUSES = ["created", "queued", "running", "succeeded", "capped", "cancelled", "failed"] as const
export const importStatusSchema = z.enum(IMPORT_STATUSES)
export type ImportStatus = z.infer<typeof importStatusSchema>

export const importJobSchema = z.object({
  id: importJobIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  source: importSourceSchema,
  status: importStatusSchema,
  config: importConfigSchema,
  credentials: importCredentialsSchema.nullable(),
  /** Where the next page starts; advanced only once a page's spans are written. */
  cursor: importCursorSchema.nullable(),
  stats: importStatsSchema,
  runs: importRunHistorySchema,
  /**
   * Why the job did not finish cleanly: the sanitized failure reason, or which ceiling
   * stopped a `capped` run. A non-null value does *not* mean the job failed — `status` is
   * the only thing that says so, and a capped import is a successful partial import.
   */
  error: z.string().nullable(),
  cancelledAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ImportJob = z.infer<typeof importJobSchema>

export const createImportJob = (
  params: Omit<
    ImportJob,
    | "id"
    | "status"
    | "cursor"
    | "stats"
    | "runs"
    | "error"
    | "cancelledAt"
    | "startedAt"
    | "finishedAt"
    | "createdAt"
    | "updatedAt"
  > & {
    id?: ImportJobId
    status?: ImportStatus
    cursor?: ImportCursor | null
    stats?: ImportJob["stats"]
  },
): ImportJob => {
  const now = new Date()
  return importJobSchema.parse({
    ...params,
    id: params.id ?? generateId<"ImportJobId">(),
    status: params.status ?? "created",
    cursor: params.cursor ?? null,
    stats: params.stats ?? defaultImportStats(),
    runs: [],
    error: null,
    cancelledAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  })
}

export type CreateImportInput = {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly source: ImportJob["source"]
  readonly config: ImportJob["config"]
  readonly credentials: NonNullable<ImportJob["credentials"]>
  /** Bounds the range by retention and the trace ceiling by remaining plan usage. */
  readonly plan: EffectivePlanResolution
  /** Not stored on the job — only stamped onto the `ImportStarted` analytics event. */
  readonly createdByUserId: UserId
}
