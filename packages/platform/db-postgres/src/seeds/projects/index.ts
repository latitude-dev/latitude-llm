import { createProject } from "@domain/projects"
import { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { SEED_ORG_ID, SEED_OWNER_USER_ID } from "../organizations/index.ts"
import type { SeedContext, Seeder } from "../types.ts"

const SEED_PROJECT_ID = ProjectId("yvl1e78evmwfs2mosyjb08rc")
const SEED_PROJECT_NAME = "Default Project"
const SEED_PROJECT_SLUG = "default-project"

const seedProjects: Seeder = {
  name: "projects/default-project",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const project = createProject({
        id: SEED_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        name: SEED_PROJECT_NAME,
        slug: SEED_PROJECT_SLUG,
        createdById: SEED_OWNER_USER_ID,
      })
      yield* ctx.repositories.project.save(project)
      console.log(`  -> project: ${project.name} (${project.slug})`)
    }),
}

export const projectSeeders: readonly Seeder[] = [seedProjects]
