import type { IssueId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AlertIncident } from "../entities/alert-incident.ts"
import { AlertIncidentRepository } from "../ports/alert-incident-repository.ts"

const DEFAULT_RANGE_DAYS = 14

export interface ListIssueAlertIncidentsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  /** Inclusive lower bound. Defaults to ~14 days before `to`. */
  readonly from?: Date
  /** Inclusive upper bound. Defaults to "now". */
  readonly to?: Date
  readonly now?: Date
}

export interface ListIssueAlertIncidentsResult {
  readonly items: readonly AlertIncident[]
}

export type ListIssueAlertIncidentsError = RepositoryError

/**
 * Lists alert incidents tied to one issue whose lifetime overlaps `[from, to]`
 * (defaults to the trailing 14 days), ordered by `startedAt` ascending. Issue
 * resolution (name/uuid lookup) is intentionally out of scope here — the
 * caller already knows which issue the incidents belong to.
 */
export const listIssueAlertIncidentsUseCase = (
  input: ListIssueAlertIncidentsInput,
): Effect.Effect<ListIssueAlertIncidentsResult, ListIssueAlertIncidentsError, AlertIncidentRepository | SqlClient> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("issueId", String(input.issueId))

    const now = input.now ?? new Date()
    const to = input.to ?? now
    const from =
      input.from ??
      (() => {
        const start = new Date(to)
        start.setUTCDate(start.getUTCDate() - DEFAULT_RANGE_DAYS)
        return start
      })()

    const incidentRepo = yield* AlertIncidentRepository
    const items = yield* incidentRepo.listByProjectInRange({
      organizationId: input.organizationId,
      projectId: input.projectId,
      from,
      to,
      sourceType: "issue",
      sourceId: String(input.issueId),
    })

    return { items } satisfies ListIssueAlertIncidentsResult
  }).pipe(Effect.withSpan("alerts.listIssueAlertIncidents"))
