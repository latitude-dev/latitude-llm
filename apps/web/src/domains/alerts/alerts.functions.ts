import {
  ALERT_INCIDENT_SOURCE_TYPES,
  type AlertIncident,
  type AlertIncidentKind,
  AlertIncidentRepository,
  type AlertSeverity,
} from "@domain/alerts"
import { IssueRepository, type IssueWithLifecycle } from "@domain/issues"
import { IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { AlertIncidentRepositoryLive, IssueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const listProjectAlertIncidentsInRangeInputSchema = z.object({
  projectId: z.string(),
  fromIso: z.iso.datetime(),
  toIso: z.iso.datetime(),
  sourceType: z.enum(ALERT_INCIDENT_SOURCE_TYPES).optional(),
  sourceId: z.string().min(1).optional(),
})

export interface AlertIncidentRecord {
  readonly id: string
  readonly projectId: string
  readonly kind: AlertIncidentKind
  readonly severity: AlertSeverity
  readonly sourceType: AlertIncident["sourceType"]
  readonly sourceId: string
  readonly startedAt: string
  readonly endedAt: string | null
  /** Resolved name of the issue tied to the incident; `null` if not found (e.g., deleted). */
  readonly issueName: string | null
  /** Stable issue uuid used for deep-linking from `/projects/:slug/issues?issueId=...`. */
  readonly issueUuid: string | null
}

const toRecord = (incident: AlertIncident, issue: IssueWithLifecycle | undefined): AlertIncidentRecord => ({
  id: incident.id,
  projectId: incident.projectId,
  kind: incident.kind,
  severity: incident.severity,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt?.toISOString() ?? null,
  issueName: issue?.name ?? null,
  issueUuid: issue?.uuid ?? null,
})

/**
 * Returns incidents for the project whose lifetime overlaps `[fromIso, toIso]`,
 * enriched with the issue's name/uuid so the histogram tooltip can show a human label
 * without a follow-up request per incident. Issue lookup is best-effort — incidents
 * whose source issue has been deleted still come back, with `issueName: null`.
 */
export const listProjectAlertIncidentsInRange = createServerFn({
  method: "GET",
})
  .inputValidator(listProjectAlertIncidentsInRangeInputSchema)
  .handler(async ({ data }): Promise<{ readonly items: readonly AlertIncidentRecord[] }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pgClient = getPostgresClient()

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const incidentRepo = yield* AlertIncidentRepository
        const issueRepo = yield* IssueRepository

        const incidents = yield* incidentRepo.listByProjectInRange({
          organizationId: orgId,
          projectId,
          from: new Date(data.fromIso),
          to: new Date(data.toIso),
          ...(data.sourceType ? { sourceType: data.sourceType } : {}),
          ...(data.sourceId ? { sourceId: data.sourceId } : {}),
        })

        const issueIds = Array.from(
          new Set(incidents.filter((i) => i.sourceType === "issue").map((i) => i.sourceId)),
        ).map(IssueId)

        const issues =
          issueIds.length > 0
            ? yield* issueRepo.findByIds({ projectId, issueIds })
            : ([] as readonly IssueWithLifecycle[])
        const issueById = new Map(issues.map((issue) => [issue.id, issue] as const))

        return incidents.map((incident) => toRecord(incident, issueById.get(IssueId(incident.sourceId))))
      }).pipe(
        withPostgres(Layer.mergeAll(AlertIncidentRepositoryLive, IssueRepositoryLive), pgClient, orgId),
        withTracing,
      ),
    )

    return { items }
  })
