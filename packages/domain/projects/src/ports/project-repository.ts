import type { NotFoundError, RepositoryError } from "@domain/shared"
import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
import type { Project } from "../entities/project.ts"

export class ProjectRepository extends EffectService<
  ProjectRepository,
  {
    findById(id: string): Effect.Effect<Project, NotFoundError | RepositoryError>
    findBySlug(slug: string): Effect.Effect<Project, NotFoundError | RepositoryError>
    list(): Effect.Effect<readonly Project[], RepositoryError>
    listIncludingDeleted(): Effect.Effect<readonly Project[], RepositoryError>
    save(project: Project): Effect.Effect<void, RepositoryError>
    softDelete(id: string): Effect.Effect<void, NotFoundError | RepositoryError>
    hardDelete(id: string): Effect.Effect<void, RepositoryError>
    existsByName(name: string): Effect.Effect<boolean, RepositoryError>
    existsBySlug(slug: string): Effect.Effect<boolean, RepositoryError>
  }
>()("@domain/projects/ProjectRepository") {}
