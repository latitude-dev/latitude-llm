import { Data, type Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import type { Repositories } from "../repositories/index.ts"

export interface SeedContext {
  readonly db: PostgresDb
  readonly repositories: Repositories
}

export class SeedError extends Data.TaggedError("SeedError")<{
  readonly reason: string
  readonly cause?: unknown
}> {}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, unknown>
}
