import type { ChSqlClient, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { JevPreclassifierObservation } from "../entities/jev-preclassifier-observation.ts"

export interface JevPreclassifierObservationRepositoryShape {
  saveMany(observations: readonly JevPreclassifierObservation[]): Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class JevPreclassifierObservationRepository extends Context.Service<
  JevPreclassifierObservationRepository,
  JevPreclassifierObservationRepositoryShape
>()("@domain/flaggers/JevPreclassifierObservationRepository") {}
