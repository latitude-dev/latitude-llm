import {
  generateId,
  MonitorAlertId,
  MonitorId,
  OrganizationId,
  type ProjectId,
  type RepositoryError,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { SYSTEM_MONITOR_DEFINITIONS, type SystemMonitorDefinition } from "../system-monitors.ts"

export interface ProvisionSystemMonitorsInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export type ProvisionSystemMonitorsError = RepositoryError

const buildSystemMonitor = (
  definition: SystemMonitorDefinition,
  input: ProvisionSystemMonitorsInput,
  now: Date,
): Monitor => {
  const monitorId = MonitorId(generateId())
  return {
    id: monitorId,
    organizationId: OrganizationId(input.organizationId),
    projectId: input.projectId,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    system: true,
    alerts: definition.alerts.map((alert) => ({
      id: MonitorAlertId(generateId()),
      monitorId,
      kind: alert.kind,
      source: alert.source,
      condition: alert.condition,
      // Severity is a pure function of kind — see SystemMonitorAlertDefinition.
      severity: SEVERITY_FOR_KIND[alert.kind],
      createdAt: now,
    })),
    mutedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Idempotently provisions the three system issue monitors for a project. On
 * re-run (e.g. a re-published `provision` task, or a project already covered by
 * the backfill) the repository inserts only the missing slugs and returns just
 * the newly-created monitors. Always provisions unmuted — no read of existing
 * `projects.settings.notifications`.
 */
export const provisionSystemMonitorsUseCase = Effect.fn("monitors.provisionSystemMonitors")(function* (
  input: ProvisionSystemMonitorsInput,
) {
  yield* Effect.annotateCurrentSpan("monitors.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("monitors.projectId", input.projectId)

  const repository = yield* MonitorRepository
  const now = new Date()
  const monitors = SYSTEM_MONITOR_DEFINITIONS.map((definition) => buildSystemMonitor(definition, input, now))

  const provisioned = yield* repository.provisionSystemMonitors(monitors)
  return provisioned satisfies readonly Monitor[]
})
