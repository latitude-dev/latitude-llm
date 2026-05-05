import { Effect } from "effect"
import type { SeedContext, Seeder } from "./types.ts"

export const runSeeders = (seeders: readonly Seeder[], ctx: SeedContext): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const total = seeders.length

    for (const [index, seeder] of seeders.entries()) {
      const step = `${index + 1}/${total}`
      if (!ctx.quiet) console.log(`- [${step}] ${seeder.name}`)
      yield* seeder.run(ctx)
      if (!ctx.quiet) console.log("  -> ok")
    }
  })
