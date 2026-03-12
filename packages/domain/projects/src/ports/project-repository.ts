import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Project } from "../entities/project.ts"

export class ProjectRepository extends ServiceMap.Service<
  ProjectRepository,
  {
    findById(id: string): Effect.Effect<Project, NotFoundError | RepositoryError>
    findAll(): Effect.Effect<readonly Project[], RepositoryError>
    findAllIncludingDeleted(): Effect.Effect<readonly Project[], RepositoryError>
    save(project: Project): Effect.Effect<void, RepositoryError>
    softDelete(id: string): Effect.Effect<void, RepositoryError>
    hardDelete(id: string): Effect.Effect<void, RepositoryError>
    existsByName(name: string): Effect.Effect<boolean, RepositoryError>
    existsBySlug(slug: string): Effect.Effect<boolean, RepositoryError>
  }
>()("@domain/projects/ProjectRepository") {}
