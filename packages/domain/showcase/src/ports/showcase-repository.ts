import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Showcase } from "../entities/showcase.ts"

export interface ShowcaseRepositoryShape {
  find(): Effect.Effect<Showcase | null, RepositoryError, SqlClient>
  create(showcase: Showcase): Effect.Effect<Showcase, RepositoryError, SqlClient>
}

export class ShowcaseRepository extends Context.Service<ShowcaseRepository, ShowcaseRepositoryShape>()(
  "@domain/showcase/ShowcaseRepository",
) {}
