import type { SeedScope } from "@domain/shared/seeding"
import { Data, type Effect } from "effect"
import type { WeaviateClient } from "weaviate-client"

export interface SeedContext {
  readonly client: WeaviateClient
  /**
   * Per-project seeding context — see {@link SeedScope}. The Weaviate
   * issue-projection seeder resolves issue ids via `ctx.scope.cuid("...")`
   * so the same seeder body works for both the canonical bootstrap
   * project (`pnpm wv:seed`) and a demo project created at runtime via
   * the backoffice.
   */
  readonly scope: SeedScope
}

export class SeedError extends Data.TaggedError("SeedError")<{
  readonly reason: string
  readonly cause?: unknown
}> {}

export interface Seeder {
  readonly name: string
  readonly run: (ctx: SeedContext) => Effect.Effect<void, SeedError>
}
