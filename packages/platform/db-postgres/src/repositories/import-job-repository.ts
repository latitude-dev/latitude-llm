import { type ImportJob, ImportJobRepository, type ImportStatus, importJobSchema } from "@domain/imports"
import {
  ConflictError,
  findPostgresUniqueViolationConstraint,
  type ImportJobId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, desc, eq, or } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { importJobs } from "../schema/import-jobs.ts"

const ORG_ACTIVE_UNIQUE_INDEX = "import_jobs_org_active_uq"

type JobRow = typeof importJobs.$inferSelect

const mapActiveImportConflict = (
  error: RepositoryError,
  organizationId: string,
): Effect.Effect<never, RepositoryError | ConflictError> => {
  const constraint = findPostgresUniqueViolationConstraint((error as { cause?: unknown }).cause)
  if (constraint === ORG_ACTIVE_UNIQUE_INDEX) {
    return Effect.fail(new ConflictError({ entity: "ImportJob", field: "organizationId", value: organizationId }))
  }
  return Effect.fail(error)
}

const parseJobDates = (config: ImportJob["config"]) => ({
  ...config,
  rangeFrom: new Date(config.rangeFrom),
  rangeTo: new Date(config.rangeTo),
})

const toDomainImportJob = (row: JobRow, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    let credentials: ImportJob["credentials"] = null
    if (row.credentials) {
      const credentialsJson = yield* decryptField(row.credentials, encryptionKey, "decryptImportCredentials")
      credentials = importJobSchema.shape.credentials.parse(JSON.parse(credentialsJson))
    }

    return importJobSchema.parse({
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      source: row.source,
      status: row.status,
      config: parseJobDates(row.config),
      credentials,
      cursor: row.cursor ?? null,
      stats: row.stats,
      runs: row.runs,
      error: row.error,
      cancelledAt: row.cancelledAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  })

const toInsertRow = (job: ImportJob, organizationId: string, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    let credentials: string | null = null
    if (job.credentials) {
      credentials = yield* encryptField(JSON.stringify(job.credentials), encryptionKey, "encryptImportCredentials")
    }

    return {
      id: job.id,
      organizationId,
      projectId: job.projectId,
      source: job.source,
      status: job.status,
      config: job.config,
      credentials,
      cursor: job.cursor,
      stats: job.stats,
      runs: job.runs,
      error: job.error,
      cancelledAt: job.cancelledAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  })

export const ImportJobRepositoryLive = Layer.effect(
  ImportJobRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    return {
      save: (job: ImportJob) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = yield* toInsertRow(job, sqlClient.organizationId, encryptionKey)
          const { id: _id, organizationId: _organizationId, createdAt: _createdAt, ...updatable } = row

          yield* sqlClient
            .query((db) =>
              db
                .insert(importJobs)
                .values(row)
                .onConflictDoUpdate({
                  target: importJobs.id,
                  set: { ...updatable, updatedAt: new Date() },
                }),
            )
            .pipe(
              Effect.catchTag("RepositoryError", (error) => mapActiveImportConflict(error, sqlClient.organizationId)),
            )
        }),

      findById: (id: ImportJobId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(importJobs)
                .where(and(eq(importJobs.id, id), eq(importJobs.organizationId, organizationId)))
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findImportJobById")))
          const row = rows[0]
          if (!row) return null
          return yield* toDomainImportJob(row, encryptionKey)
        }),

      listByProjectId: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(importJobs)
                .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.projectId, projectId)))
                .orderBy(desc(importJobs.createdAt)),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "listImportJobsByProjectId")))
          return yield* Effect.forEach(rows, (row) => toDomainImportJob(row, encryptionKey))
        }),

      findActive: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(importJobs)
                .where(
                  and(
                    eq(importJobs.organizationId, organizationId),
                    or(
                      eq(importJobs.status, "created"),
                      eq(importJobs.status, "queued"),
                      eq(importJobs.status, "running"),
                    ),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveImportJob")))
          const row = rows[0]
          if (!row) return null
          return yield* toDomainImportJob(row, encryptionKey)
        }),

      updateStatus: (
        id: ImportJobId,
        status: ImportStatus,
        patch?: Partial<
          Pick<
            ImportJob,
            "cursor" | "stats" | "runs" | "error" | "cancelledAt" | "startedAt" | "finishedAt" | "credentials"
          >
        >,
      ) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const existing = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(importJobs)
                .where(and(eq(importJobs.id, id), eq(importJobs.organizationId, organizationId)))
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateImportJobStatus")))
          const row = existing[0]
          if (!row) return null

          const job = yield* toDomainImportJob(row, encryptionKey)
          const updated: ImportJob = {
            ...job,
            ...patch,
            status,
            updatedAt: new Date(),
          }
          const insertRow = yield* toInsertRow(updated, sqlClient.organizationId, encryptionKey)
          const { id: _id, organizationId: _organizationId, createdAt: _createdAt, ...updatable } = insertRow

          const returned = yield* sqlClient
            .query((db) =>
              db
                .update(importJobs)
                .set({ ...updatable, status, updatedAt: new Date() })
                .where(eq(importJobs.id, id))
                .returning(),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateImportJobStatus")))

          const updatedRow = returned[0]
          if (!updatedRow) return null
          return yield* toDomainImportJob(updatedRow, encryptionKey)
        }),

      markFailedIfActive: (id, input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(importJobs)
                .set({
                  status: "failed",
                  error: input.error,
                  finishedAt: input.finishedAt,
                  credentials: null,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(importJobs.id, id),
                    eq(importJobs.organizationId, organizationId),
                    or(
                      eq(importJobs.status, "created"),
                      eq(importJobs.status, "queued"),
                      eq(importJobs.status, "running"),
                    ),
                  ),
                )
                .returning({ id: importJobs.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "markImportJobFailedIfActive")))

          return rows.length > 0
        }),

      deleteByProjectId: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(importJobs)
                .where(and(eq(importJobs.organizationId, organizationId), eq(importJobs.projectId, projectId))),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteImportJobsByProjectId")))
        }),
    }
  }),
)

export const redactedImportJob = (job: ImportJob): ImportJob => ({
  ...job,
  credentials: null,
})
