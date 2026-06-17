import {
  ALERT_INCIDENT_SOURCE_TYPES,
  type AlertIncident,
  type AlertIncidentKind,
  AlertIncidentRepository,
  type AlertSeverity,
} from "@domain/alerts"
import { formatHumanReadableAlert } from "@domain/monitors"
import { type IncidentMonitorInfo, IncidentMonitorReader } from "@domain/notifications"
import { SavedSearchRepository } from "@domain/saved-searches"
import { OrganizationId, ProjectId, SavedSearchId, SignalId } from "@domain/shared"
import { SignalRepository, type SignalWithLifecycle } from "@domain/signals"
import {
  AlertIncidentRepositoryLive,
  IncidentMonitorReaderLive,
  SavedSearchRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
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
  /** `null` for unified (target-on-monitor) incidents — the target lives on the monitor. */
  readonly sourceId: string | null
  readonly startedAt: string
  readonly endedAt: string | null
  /** Resolved name of the issue tied to the incident; `null` if not found (e.g., deleted). */
  readonly signalName: string | null
  /** Resolved name of the saved search tied to the incident (the source); `null` on issue rows or when deleted. */
  readonly savedSearchName: string | null
  /** Owning monitor name + slug for the attribution line + deep link; `null` on legacy or issue rows. */
  readonly monitorName: string | null
  readonly monitorSlug: string | null
  /** Humanised firing condition; `null` for no-condition kinds. Drives the saved-search subtitle. */
  readonly conditionSummary: string | null
}

const toRecord = (
  incident: AlertIncident,
  issue: SignalWithLifecycle | undefined,
  savedSearchName: string | undefined,
  monitor: IncidentMonitorInfo | undefined,
): AlertIncidentRecord => ({
  id: incident.id,
  projectId: incident.projectId,
  kind: incident.kind,
  severity: incident.severity,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt?.toISOString() ?? null,
  signalName: issue?.name ?? null,
  savedSearchName: savedSearchName ?? null,
  monitorName: monitor?.name ?? null,
  monitorSlug: monitor?.slug ?? null,
  conditionSummary: incident.condition
    ? formatHumanReadableAlert({ kind: incident.kind, condition: incident.condition })
    : null,
})

/**
 * Returns incidents for the project whose lifetime overlaps `[fromIso, toIso]`,
 * enriched with the issue's name/uuid so the histogram tooltip can show a human label
 * without a follow-up request per incident. Signal lookup is best-effort — incidents
 * whose source issue has been deleted still come back, with `signalName: null`.
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
        const signalRepo = yield* SignalRepository
        const savedSearchRepo = yield* SavedSearchRepository
        const monitorReader = yield* IncidentMonitorReader

        const incidents = yield* incidentRepo.listByProjectId({
          organizationId: orgId,
          projectId,
          from: new Date(data.fromIso),
          to: new Date(data.toIso),
          ...(data.sourceType ? { sourceTypes: [data.sourceType] } : {}),
          ...(data.sourceId ? { sourceId: data.sourceId } : {}),
        })

        const signalIds = Array.from(
          new Set(incidents.flatMap((i) => (i.sourceType === "issue" && i.sourceId !== null ? [i.sourceId] : []))),
        ).map(SignalId)

        const issues =
          signalIds.length > 0
            ? yield* signalRepo.findByIds({ projectId, signalIds })
            : ([] as readonly SignalWithLifecycle[])
        const signalById = new Map(issues.map((issue) => [issue.id, issue] as const))

        // Saved-search names are the source label for `savedSearch.*` rows (mirrors the issue name).
        const savedSearchIds = Array.from(
          new Set(
            incidents.flatMap((i) => (i.sourceType === "savedSearch" && i.sourceId !== null ? [i.sourceId] : [])),
          ),
        )
        const savedSearchNameById = new Map<string, string>()
        for (const id of savedSearchIds) {
          const found = yield* savedSearchRepo.findById(SavedSearchId(id)).pipe(
            Effect.map((s) => s.name),
            Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)),
          )
          if (found !== null) savedSearchNameById.set(id, found)
        }

        const monitorAlertIds = Array.from(
          new Set(incidents.filter((i) => i.monitorAlertId !== null).map((i) => i.monitorAlertId as string)),
        )
        const monitorByAlertId = new Map<string, IncidentMonitorInfo>()
        for (const alertId of monitorAlertIds) {
          const info = yield* monitorReader.findByAlertId(alertId)
          if (info) monitorByAlertId.set(alertId, info)
        }

        return incidents.map((incident) =>
          toRecord(
            incident,
            incident.sourceType === "issue" && incident.sourceId !== null
              ? signalById.get(SignalId(incident.sourceId))
              : undefined,
            incident.sourceId !== null ? savedSearchNameById.get(incident.sourceId) : undefined,
            incident.monitorAlertId ? monitorByAlertId.get(incident.monitorAlertId) : undefined,
          ),
        )
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            AlertIncidentRepositoryLive,
            SignalRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentMonitorReaderLive,
          ),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return { items }
  })
