import { issueSeeders } from "./issues/index.ts"
import type { Seeder } from "./types.ts"

export const allSeeders: readonly Seeder[] = [...issueSeeders]
