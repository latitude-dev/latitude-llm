import { createProject } from "@domain/projects"
import { ProjectId } from "@domain/shared-kernel"
import { Effect } from "effect"
import { SEED_ORG_ID, SEED_OWNER_USER_ID } from "../organizations/index.ts"
import type { SeedContext, Seeder } from "../types.ts"

const SEED_PROJECT_ID = ProjectId("yvl1e78evmwfs2mosyjb08rc")

const seedProjects: Seeder = {
  name: "projects/default-project",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const project = createProject({
        id: SEED_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        name: "Default Project",
        slug: "default-project",
        createdById: SEED_OWNER_USER_ID,
      })
      yield* ctx.repositories.project.save(project)
    }),
}

export const projectSeeders: readonly Seeder[] = [seedProjects]
