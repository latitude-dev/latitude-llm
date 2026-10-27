import type { NotFoundError, ProjectId, RepositoryError, SqlClient, TraceDeletionRequestId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TraceDeletionRequest } from "../entities/trace-deletion-request.ts"

export interface TraceDeletionRequestPage {
  readonly items: readonly TraceDeletionRequest[]
  readonly nextCursor: string | null
}

export interface TraceDeletionRequestRepositoryShape {
  findById(id: TraceDeletionRequestId): Effect.Effect<TraceDeletionRequest, NotFoundError | RepositoryError, SqlClient>
  /** Newest first; `cursor` is the `nextCursor` of the previous page. */
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly limit: number
    readonly cursor?: string | undefined
  }): Effect.Effect<TraceDeletionRequestPage, RepositoryError, SqlClient>
  save(request: TraceDeletionRequest): Effect.Effect<void, RepositoryError, SqlClient>
}

export class TraceDeletionRequestRepository extends Context.Service<
  TraceDeletionRequestRepository,
  TraceDeletionRequestRepositoryShape
>()("@domain/spans/TraceDeletionRequestRepository") {}
