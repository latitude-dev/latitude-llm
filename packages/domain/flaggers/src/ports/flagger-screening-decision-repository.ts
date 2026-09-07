import type { ChSqlClient, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"

export interface FlaggerScreeningDecisionRepositoryShape {
  saveMany(decisions: readonly FlaggerScreeningDecision[]): Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class FlaggerScreeningDecisionRepository extends Context.Service<
  FlaggerScreeningDecisionRepository,
  FlaggerScreeningDecisionRepositoryShape
>()("@domain/flaggers/FlaggerScreeningDecisionRepository") {}
