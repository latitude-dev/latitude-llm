import type { ConflictError, ImportJobId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ImportJob, ImportStatus } from "../entities/import-job.ts"

export interface ImportJobRepositoryShape {
  save(job: ImportJob): Effect.Effect<void, RepositoryError | ConflictError, SqlClient>
  findById(id: ImportJobId): Effect.Effect<ImportJob | null, RepositoryError, SqlClient>
  listByProjectId(projectId: ProjectId): Effect.Effect<readonly ImportJob[], RepositoryError, SqlClient>
  /** The org's single unfinished import, per the `..._org_active_uq` partial unique index. */
  findActive(): Effect.Effect<ImportJob | null, RepositoryError, SqlClient>
  /** Returns the persisted row, so callers report what was written rather than what they sent. */
  updateStatus(
    id: ImportJobId,
    status: ImportStatus,
    patch?: Partial<
      Pick<
        ImportJob,
        "cursor" | "stats" | "runs" | "error" | "cancelledAt" | "startedAt" | "finishedAt" | "credentials"
      >
    >,
  ): Effect.Effect<ImportJob | null, RepositoryError, SqlClient>
  markFailedIfActive(
    id: ImportJobId,
    input: { readonly error: string; readonly finishedAt: Date },
  ): Effect.Effect<boolean, RepositoryError, SqlClient>
  deleteByProjectId(projectId: ProjectId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class ImportJobRepository extends Context.Service<ImportJobRepository, ImportJobRepositoryShape>()(
  "@domain/imports/ImportJobRepository",
) {}
