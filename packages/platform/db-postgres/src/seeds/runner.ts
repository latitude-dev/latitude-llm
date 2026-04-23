import type { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { SeedContext, Seeder } from "./types.ts"

export const runSeeders = (seeders: readonly Seeder[], ctx: SeedContext): Effect.Effect<void, unknown, SqlClient> =>
  Effect.gen(function* () {
    const total = seeders.length

    for (const [index, seeder] of seeders.entries()) {
      const step = `${index + 1}/${total}`
      console.log(`- [${step}] ${seeder.name}`)
      yield* seeder.run(ctx)
      console.log("  -> ok")
    }
  })
