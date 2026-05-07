import { type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AlertIncidentKind } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

export interface CloseAlertIncidentFromIssueEventInput {
  readonly kind: AlertIncidentKind
  readonly issueId: string
  readonly endedAt: Date
}

export type CloseAlertIncidentFromIssueEventError = RepositoryError

export const closeAlertIncidentFromIssueEventUseCase = (input: CloseAlertIncidentFromIssueEventInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncident.kind", input.kind)
    yield* Effect.annotateCurrentSpan("alertIncident.issueId", input.issueId)

    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        const alertIncidentRepository = yield* AlertIncidentRepository
        yield* alertIncidentRepository.closeOpen({
          sourceType: "issue",
          sourceId: input.issueId,
          kind: input.kind,
          endedAt: input.endedAt,
        })
      }),
    )
  }).pipe(Effect.withSpan("alerts.closeAlertIncidentFromIssueEvent")) as Effect.Effect<
    void,
    CloseAlertIncidentFromIssueEventError,
    SqlClient | AlertIncidentRepository
  >
