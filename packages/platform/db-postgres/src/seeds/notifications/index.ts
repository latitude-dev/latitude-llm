import { Effect } from "effect"
import type { Seeder } from "../types.ts"

export const notificationSeeders: readonly Seeder[] = [
  {
    name: "notifications",
    run: () => Effect.void,
  },
]
