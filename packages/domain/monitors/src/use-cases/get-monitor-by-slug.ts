import type { NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface GetMonitorBySlugInput {
  readonly projectId: ProjectId
  readonly slug: string
}

export const getMonitorBySlugUseCase = (
  input: GetMonitorBySlugInput,
): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    return yield* repository.findBySlug(input)
  })
