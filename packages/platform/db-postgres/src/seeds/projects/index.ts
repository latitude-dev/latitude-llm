import { createProject } from "@domain/projects"
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_PROJECT_NAME, SEED_PROJECT_SLUG } from "@domain/shared/seeding"
import { Effect } from "effect"
import type { SeedContext, Seeder } from "../types.ts"

const seedProjects: Seeder = {
  name: "projects/default-project",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const project = createProject({
        id: SEED_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        name: SEED_PROJECT_NAME,
        slug: SEED_PROJECT_SLUG,
      })
      yield* ctx.repositories.project.save(project)
      console.log(`  -> project: ${project.name} (${project.slug})`)
    }),
}

export const projectSeeders: readonly Seeder[] = [seedProjects]
