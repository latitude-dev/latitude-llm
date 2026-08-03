import { createProject } from "@domain/projects"
import type { ProjectId } from "@domain/shared/seeding"
import {
  SEED_COST_ARCHETYPE_PROJECTS,
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_ID,
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_NAME,
  SEED_LATITUDE_ANNOTATION_ENRICHMENT_PROJECT_SLUG,
  SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_ID,
  SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_NAME,
  SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_SLUG,
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
  SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_ID,
  SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_NAME,
  SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_SLUG,
  SEED_LATITUDE_TAXONOMY_PROJECT_ID,
  SEED_LATITUDE_TAXONOMY_PROJECT_NAME,
  SEED_LATITUDE_TAXONOMY_PROJECT_SLUG,
  SEED_OLD_TRACES_QA_FROM_DAYS_AGO,
  SEED_OLD_TRACES_QA_PROJECT_ID,
  SEED_OLD_TRACES_QA_PROJECT_NAME,
  SEED_OLD_TRACES_QA_PROJECT_SLUG,
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
    id: SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_ID,
    name: SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_NAME,
    slug: SEED_LATITUDE_SIGNAL_GENERATION_PROJECT_SLUG,
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
  {
    id: SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_ID,
    name: SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_NAME,
    slug: SEED_LATITUDE_CONVERSATION_INTELLIGENCE_PROJECT_SLUG,
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

// QA fixture: project with a backdated first_trace_at; its ClickHouse spans (seeded separately) all predate the default window.
const seedOldTracesQaProject: Seeder = {
  name: "projects/old-traces-qa",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const project = createProject({
        id: SEED_OLD_TRACES_QA_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        name: SEED_OLD_TRACES_QA_PROJECT_NAME,
        slug: SEED_OLD_TRACES_QA_PROJECT_SLUG,
        firstTraceAt: new Date(Date.now() - SEED_OLD_TRACES_QA_FROM_DAYS_AGO * 24 * 60 * 60 * 1000),
      })
      yield* ctx.repositories.project.save(project)
      console.log(
        `  -> project: ${project.name} (${project.slug}) [first_trace_at ~${SEED_OLD_TRACES_QA_FROM_DAYS_AGO}d ago]`,
      )
    }),
}

// QA fixtures for the cost section: one project per archetype. The unhealthy
// archetype is absent on purpose — it seeds onto the default project above.
const seedCostArchetypeProjects: Seeder = {
  name: "projects/cost-archetypes",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      for (const definition of Object.values(SEED_COST_ARCHETYPE_PROJECTS)) {
        const project = createProject({
          id: definition.id,
          organizationId: SEED_ORG_ID,
          name: definition.name,
          slug: definition.slug,
          firstTraceAt: new Date(Date.now() - definition.firstTraceAtDaysAgo * 24 * 60 * 60 * 1000),
        })
        yield* ctx.repositories.project.save(project)
        console.log(`  -> project: ${project.name} (${project.slug})`)
      }
    }),
}

export const projectSeeders: readonly Seeder[] = [
  seedProjects,
  seedLatitudeDogfoodProjects,
  seedOldTracesQaProject,
  seedCostArchetypeProjects,
]
