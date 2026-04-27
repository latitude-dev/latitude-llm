import { createProject } from "@domain/projects"
import {
  SEED_LATITUDE_TELEMETRY_PROJECT_ID,
  SEED_LATITUDE_TELEMETRY_PROJECT_NAME,
  SEED_LATITUDE_TELEMETRY_PROJECT_SLUG,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_PROJECT_NAME,
  SEED_PROJECT_SLUG,
} from "@domain/shared/seeding"
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

// Dogfood project: receives LLM telemetry from Latitude's own system annotator
// + enrichment calls, plus the product-feedback annotations written back via
// `@platform/latitude-api`. Lives in the same org so the default seed API key
// token authenticates for both. Matches the `LAT_LATITUDE_TELEMETRY_PROJECT_SLUG`
// default in `.env.example`.
const seedLatitudeTelemetryProject: Seeder = {
  name: "projects/latitude-telemetry",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const project = createProject({
        id: SEED_LATITUDE_TELEMETRY_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        name: SEED_LATITUDE_TELEMETRY_PROJECT_NAME,
        slug: SEED_LATITUDE_TELEMETRY_PROJECT_SLUG,
      })
      yield* ctx.repositories.project.save(project)
      console.log(`  -> project: ${project.name} (${project.slug})`)
    }),
}

export const projectSeeders: readonly Seeder[] = [seedProjects, seedLatitudeTelemetryProject]
