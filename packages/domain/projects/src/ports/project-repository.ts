import type { NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Project } from "../entities/project.ts"

export class ProjectRepository extends Context.Service<
  ProjectRepository,
  {
    findById(id: string): Effect.Effect<Project, NotFoundError | RepositoryError, SqlClient>
    findBySlug(slug: string): Effect.Effect<Project, NotFoundError | RepositoryError, SqlClient>
    list(): Effect.Effect<readonly Project[], RepositoryError, SqlClient>
    listIncludingDeleted(): Effect.Effect<readonly Project[], RepositoryError, SqlClient>
    save(project: Project): Effect.Effect<void, RepositoryError, SqlClient>
    softDelete(id: string): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
    hardDelete(id: string): Effect.Effect<void, RepositoryError, SqlClient>
    existsByName(name: string): Effect.Effect<boolean, RepositoryError, SqlClient>
    /**
     * Count of non-deleted projects in the active organization that already
     * own this slug. Powers the `exists` callback of `generateSlug`. With the
     * unique constraint added in M1 the result is always 0 or 1, but the
     * count shape keeps the contract uniform with the other entities and
     * works whether or not the constraint is in place yet.
     */
    countBySlug(slug: string, excludeProjectId?: string): Effect.Effect<number, RepositoryError, SqlClient>
  }
>()("@domain/projects/ProjectRepository") {}
