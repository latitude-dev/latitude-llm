import {
  braintrustRegionSchema,
  IMPORT_RUN_STATUSES,
  IMPORT_SOURCES,
  IMPORT_STATUSES,
  type ImportJob,
  type ImportRun,
  langfuseRegionSchema,
  langsmithRegionSchema,
} from "@domain/imports"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

const LangfuseImportCredentialsSchema = z
  .object({
    kind: z.literal("langfuse").describe("Marks these as Langfuse credentials."),
    region: langfuseRegionSchema.describe("Langfuse Cloud region the account lives in."),
    publicKey: z.string().min(1).describe("Langfuse project public key (`pk-lf-…`)."),
    secretKey: z.string().min(1).describe("Langfuse project secret key (`sk-lf-…`)."),
  })
  .openapi("LangfuseImportCredentials")

const LangsmithImportCredentialsSchema = z
  .object({
    kind: z.literal("langsmith").describe("Marks these as LangSmith credentials."),
    region: langsmithRegionSchema.describe("LangSmith region the account lives in."),
    apiKey: z.string().min(1).describe("LangSmith API key (`lsv2_pt_…`)."),
    workspaceId: z
      .string()
      .optional()
      .describe("Workspace to import from, for accounts with more than one. Omit to use the key's default workspace."),
  })
  .openapi("LangsmithImportCredentials")

const BraintrustImportCredentialsSchema = z
  .object({
    kind: z.literal("braintrust").describe("Marks these as Braintrust credentials."),
    region: braintrustRegionSchema.describe("Braintrust data plane the organization lives on."),
    apiKey: z.string().min(1).describe("Braintrust API key with read access to the project."),
  })
  .openapi("BraintrustImportCredentials")

export const ImportCredentialsSchema = z
  .discriminatedUnion("kind", [
    LangfuseImportCredentialsSchema,
    LangsmithImportCredentialsSchema,
    BraintrustImportCredentialsSchema,
  ])
  .openapi("ImportCredentials")

const ImportConfigSchema = z
  .object({
    sourceProjectId: z.string().describe("Id of the project on the platform the import reads from."),
    sourceProjectName: z.string().describe("Name of the platform project, as shown in Latitude."),
    sourceRegion: z.string().describe("Platform region the import runs against."),
    rangeFrom: z.string().describe("ISO-8601 start of the imported time range (inclusive)."),
    rangeTo: z.string().describe("ISO-8601 end of the imported time range (exclusive)."),
    maxTraces: z.number().int().describe("Most traces this import will bring in, newest first."),
    sessionMetadataKey: z
      .string()
      .nullable()
      .describe("LangSmith only: run metadata key that groups traces into sessions. `null` elsewhere."),
  })
  .openapi("ImportConfig")

const ImportStatsSchema = z
  .object({
    recordsFetched: z.number().int().describe("Rows read from the platform, including spans later skipped."),
    sessionsImported: z.number().int().describe("Distinct sessions among the imported traces."),
    tracesImported: z.number().int().describe("Traces imported. One imported trace bills one credit."),
    spansImported: z.number().int().describe("Spans written across all imported traces."),
    spansSkipped: z.number().int().describe("Spans skipped because they carried no usable trace or span id."),
  })
  .openapi("ImportStats")

const importFields = {
  id: cuidSchema.describe("Stable import identifier."),
  organizationId: cuidSchema.describe("Organization that owns this import."),
  projectId: cuidSchema.describe("Latitude project the traces are imported into."),
  source: z.enum(IMPORT_SOURCES).describe("Observability platform the import reads from."),
  status: z
    .enum(IMPORT_STATUSES)
    .describe(
      "Lifecycle state. `created`/`queued`/`running` are in flight; `succeeded` finished cleanly; `capped` stopped at a ceiling with everything before it kept; `cancelled` and `failed` can be retried.",
    ),
  config: ImportConfigSchema.describe("What the import was asked to bring in, snapshotted when it was created."),
  stats: ImportStatsSchema.describe("What the import has brought in so far."),
  error: z
    .string()
    .nullable()
    .describe(
      "Why the import did not finish cleanly, or which ceiling stopped a `capped` one. `status` alone says whether it failed.",
    ),
  cancelledAt: z.string().nullable().describe("ISO-8601 timestamp at which cancellation was requested, or `null`."),
  startedAt: z.string().nullable().describe("ISO-8601 timestamp at which a worker picked the import up, or `null`."),
  finishedAt: z
    .string()
    .nullable()
    .describe("ISO-8601 timestamp at which the import ended, or `null` while in flight."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
} as const

export const ImportSchema = z.object(importFields).openapi("Import")

const ImportRunSchema = z
  .object({
    status: z.enum(IMPORT_RUN_STATUSES).describe("Whether this page of the import was written."),
    stats: ImportStatsSchema.describe("What this page alone brought in."),
    error: z.string().nullable().describe("Why this page failed, or `null`."),
    startedAt: z.string().describe("ISO-8601 timestamp at which the page started."),
    finishedAt: z.string().describe("ISO-8601 timestamp at which the page ended."),
  })
  .openapi("ImportRun")

export const ImportDetailSchema = ImportSchema.extend({
  runs: z
    .array(ImportRunSchema)
    .describe("Recent pages the import processed, newest first. Bounded, so old pages fall off."),
}).openapi("ImportDetail")

export const toImportResponse = (job: ImportJob) => ({
  id: job.id as string,
  organizationId: job.organizationId as string,
  projectId: job.projectId as string,
  source: job.source,
  status: job.status,
  config: {
    sourceProjectId: job.config.sourceProjectId,
    sourceProjectName: job.config.sourceProjectName,
    sourceRegion: job.config.sourceRegion,
    rangeFrom: job.config.rangeFrom.toISOString(),
    rangeTo: job.config.rangeTo.toISOString(),
    maxTraces: job.config.maxTraces,
    sessionMetadataKey: job.config.sessionMetadataKey ?? null,
  },
  stats: job.stats,
  error: job.error,
  cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
  startedAt: job.startedAt ? job.startedAt.toISOString() : null,
  finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
})

const toImportRunResponse = (run: ImportRun) => ({
  status: run.status,
  stats: run.stats,
  error: run.error,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt.toISOString(),
})

export const toImportDetailResponse = (job: ImportJob) => ({
  ...toImportResponse(job),
  runs: job.runs.map(toImportRunResponse),
})
