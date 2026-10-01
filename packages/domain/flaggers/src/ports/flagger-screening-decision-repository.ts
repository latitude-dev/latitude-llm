import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SessionId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"

export interface FlaggerScreeningDecisionRepositoryShape {
  saveMany(decisions: readonly FlaggerScreeningDecision[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  listLatestBySessions(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionIds: readonly SessionId[]
    readonly cutoff: Date
  }): Effect.Effect<readonly FlaggerScreeningDecision[], RepositoryError, ChSqlClient>
}

export class FlaggerScreeningDecisionRepository extends Context.Service<
  FlaggerScreeningDecisionRepository,
  FlaggerScreeningDecisionRepositoryShape
>()("@domain/flaggers/FlaggerScreeningDecisionRepository") {}
