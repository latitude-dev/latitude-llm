import { apiKeySeeders } from "./api-keys/index.ts"
import { datasetSeeders } from "./datasets/index.ts"
import { organizationSeeders } from "./organizations/index.ts"
import { projectSeeders } from "./projects/index.ts"
import type { Seeder } from "./types.ts"

export const allSeeders: readonly Seeder[] = [
  ...organizationSeeders,
  ...projectSeeders,
  ...apiKeySeeders,
  ...datasetSeeders,
]
