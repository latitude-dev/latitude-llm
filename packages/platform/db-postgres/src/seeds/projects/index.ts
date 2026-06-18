import { createProject } from "@domain/projects"
import type { ProjectId } from "@domain/shared/seeding"
import {
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_ID,
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_NAME,
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_SLUG,
  SEED_LATITUDE_EVALUATIONS_PROJECT_ID,
  SEED_LATITUDE_EVALUATIONS_PROJECT_NAME,
  SEED_LATITUDE_EVALUATIONS_PROJECT_SLUG,
  SEED_LATITUDE_FLAGGERS_PROJECT_ID,
  SEED_LATITUDE_FLAGGERS_PROJECT_NAME,
  SEED_LATITUDE_FLAGGERS_PROJECT_SLUG,
  SEED_LATITUDE_OPTIMIZATIONS_PROJECT_ID,
  SEED_LATITUDE_OPTIMIZATIONS_PROJECT_NAME,
  SEED_LATITUDE_OPTIMIZATIONS_PROJECT_SLUG,
  SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_ID,
  SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_NAME,
  SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_SLUG,
  SEED_LATITUDE_TAXONOMY_PROJECT_ID,
  SEED_LATITUDE_TAXONOMY_PROJECT_NAME,
  SEED_LATITUDE_TAXONOMY_PROJECT_SLUG,
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

// Dogfood projects — one per internal AI feature. Each receives the LLM
// generations that feature exports (and, for flaggers / annotation-enrichment,
// the product-feedback annotations written back via `@platform/latitude-api`).
// All live in the seed org so the default seed API key token authenticates for
// every one. Slugs mirror `LATITUDE_TELEMETRY_PROJECT_SLUGS`.
const DOGFOOD_PROJECTS: readonly { readonly id: ProjectId; readonly name: string; readonly slug: string }[] = [
  {
    id: SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_ID,
    name: SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_NAME,
    slug: SEED_LATITUDE_SIGNAL_DISCOVERY_PROJECT_SLUG,
  },
  {
    id: SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_ID,
    name: SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_NAME,
    slug: SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_SLUG,
  },
  {
    id: SEED_LATITUDE_FLAGGERS_PROJECT_ID,
    name: SEED_LATITUDE_FLAGGERS_PROJECT_NAME,
    slug: SEED_LATITUDE_FLAGGERS_PROJECT_SLUG,
  },
  {
    id: SEED_LATITUDE_EVALUATIONS_PROJECT_ID,
    name: SEED_LATITUDE_EVALUATIONS_PROJECT_NAME,
    slug: SEED_LATITUDE_EVALUATIONS_PROJECT_SLUG,
  },
  {
    id: SEED_LATITUDE_OPTIMIZATIONS_PROJECT_ID,
    name: SEED_LATITUDE_OPTIMIZATIONS_PROJECT_NAME,
    slug: SEED_LATITUDE_OPTIMIZATIONS_PROJECT_SLUG,
  },
  {
    id: SEED_LATITUDE_TAXONOMY_PROJECT_ID,
    name: SEED_LATITUDE_TAXONOMY_PROJECT_NAME,
    slug: SEED_LATITUDE_TAXONOMY_PROJECT_SLUG,
  },
]

const seedLatitudeDogfoodProjects: Seeder = {
  name: "projects/latitude-dogfood",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      for (const definition of DOGFOOD_PROJECTS) {
        const project = createProject({
          id: definition.id,
          organizationId: SEED_ORG_ID,
          name: definition.name,
          slug: definition.slug,
        })
        yield* ctx.repositories.project.save(project)
        console.log(`  -> project: ${project.name} (${project.slug})`)
      }
    }),
}

export const projectSeeders: readonly Seeder[] = [seedProjects, seedLatitudeDogfoodProjects]
