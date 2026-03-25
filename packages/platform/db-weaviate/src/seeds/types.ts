import { Data, type Effect } from "effect"
import type { WeaviateClient } from "weaviate-client"

export interface SeedContext {
  readonly client: WeaviateClient
}

export class SeedError extends Data.TaggedError("SeedError")<{
  readonly reason: string
  readonly cause?: unknown
}> {}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, SeedError>
}
