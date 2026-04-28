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

export const allSeeders: readonly Seeder[] = [
  ...organizationSeeders,
  ...projectSeeders,
  ...apiKeySeeders,
  ...datasetSeeders,
  ...issueSeeders,
  ...evaluationSeeders,
  ...simulationSeeders,
  ...scoreSeeders,
  ...annotationQueueSeeders,
  ...flaggerSeeders,
]
