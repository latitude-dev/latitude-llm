import type { ChSqlClient, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { JevShadowObservation } from "../entities/jev-shadow-observation.ts"

export interface JevShadowObservationRepositoryShape {
  save(observation: JevShadowObservation): Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class JevShadowObservationRepository extends Context.Service<
  JevShadowObservationRepository,
  JevShadowObservationRepositoryShape
>()("@domain/flaggers/JevShadowObservationRepository") {}
