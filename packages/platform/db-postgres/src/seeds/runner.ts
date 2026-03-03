import { Effect } from "effect"
import type { SeedContext, Seeder } from "./types.ts"

export const runSeeders = (seeders: readonly Seeder[], ctx: SeedContext): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    for (const seeder of seeders) {
      console.log(`  ▸ ${seeder.name}`)
      yield* seeder.run(ctx)
      console.log(`  ✓ ${seeder.name}`)
    }
  })
