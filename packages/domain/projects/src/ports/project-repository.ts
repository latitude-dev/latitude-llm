import type { NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Project } from "../entities/project.ts"

export class ProjectRepository extends ServiceMap.Service<
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
    existsBySlug(slug: string): Effect.Effect<boolean, RepositoryError, SqlClient>
  }
>()("@domain/projects/ProjectRepository") {}
