import { Effect } from "effect"
import type { Seeder } from "../types.ts"

export const alertIncidentSeeders: readonly Seeder[] = [
  {
    name: "alert-incidents",
    run: () => Effect.void,
  },
]
