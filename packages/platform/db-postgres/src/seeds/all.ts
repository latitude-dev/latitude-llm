import { annotationQueueSeeders } from "./annotation-queues/index.ts"
import { apiKeySeeders } from "./api-keys/index.ts"
import { datasetSeeders } from "./datasets/index.ts"
import { evaluationSeeders } from "./evaluations/index.ts"
import { flaggerSeeders } from "./flaggers/index.ts"
import { issueSeeders } from "./issues/index.ts"
import { organizationSeeders } from "./organizations/index.ts"
import { projectSeeders } from "./projects/index.ts"
import { scoreSeeders } from "./scores/index.ts"
import { simulationSeeders } from "./simulations/index.ts"
import type { Seeder } from "./types.ts"

/**
 * Per-project ("content") seeders — datasets, evaluations, issues,
 * simulations, scores, annotation queues. Re-used by the runtime
 * "Create Demo Project" Temporal activity, which threads a per-project
 * `SeedScope` so all entity ids derive fresh under the new project.
 *
 * Bootstrap-only seeders (org / users / api-keys / projects rows) are
 * excluded — the demo path operates on an existing org with an existing
 * default API key, and the project row itself is created up-front by
 * the use-case before the workflow runs.
 */
export const contentSeeders: readonly Seeder[] = [
  ...datasetSeeders,
  ...issueSeeders,
  ...evaluationSeeders,
  ...simulationSeeders,
  ...scoreSeeders,
  ...annotationQueueSeeders,
  ...flaggerSeeders,
]

export const allSeeders: readonly Seeder[] = [
  ...organizationSeeders,
  ...projectSeeders,
  ...apiKeySeeders,
  ...contentSeeders,
]
