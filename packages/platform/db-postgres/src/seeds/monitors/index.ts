import { Effect } from "effect"
import type { Seeder } from "../types.ts"

export const monitorSeeders: readonly Seeder[] = [
  {
    name: "monitors",
    run: () => Effect.void,
  },
]
