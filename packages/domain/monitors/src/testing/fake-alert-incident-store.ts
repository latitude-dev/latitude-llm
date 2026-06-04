import { type AlertIncident, AlertIncidentRepository, type AlertIncidentRepositoryShape } from "@domain/alerts"
import { Effect, Layer } from "effect"

/**
 * In-memory `AlertIncidentRepository` for the saved-search firing tests. Backs
 * only the methods the state machines touch; everything else dies loudly. Seed
 * via the argument and assert against the returned `incidents` array.
 */
export const createFakeAlertIncidentStore = (seed: readonly AlertIncident[] = []) => {
  const incidents: AlertIncident[] = [...seed]

  const patch = (id: string, next: Partial<AlertIncident>) => {
    const index = incidents.findIndex((incident) => incident.id === id)
    const current = incidents[index]
    if (current) incidents[index] = { ...current, ...next }
  }

  const repo: AlertIncidentRepositoryShape = {
    insert: (incident) =>
      Effect.sync(() => {
        incidents.push(incident)
      }),
    existsByMonitorAlertId: (monitorAlertId) =>
      Effect.sync(() => incidents.some((incident) => incident.monitorAlertId === monitorAlertId)),
    findOpenByMonitorAlertId: (monitorAlertId) =>
      Effect.sync(
        () =>
          incidents.find((incident) => incident.monitorAlertId === monitorAlertId && incident.endedAt === null) ?? null,
      ),
    setEndedAt: ({ id, endedAt }) => Effect.sync(() => patch(id, { endedAt })),
    updateExitDwell: ({ id, exitEligibleSince }) => Effect.sync(() => patch(id, { exitEligibleSince })),
    findById: () => Effect.die("findById not used by saved-search firing"),
    findOpen: () => Effect.die("findOpen not used by saved-search firing"),
    closeOpen: () => Effect.die("closeOpen not used by saved-search firing"),
    listByProjectId: () => Effect.die("listByProjectId not used by saved-search firing"),
    listOpenByKind: () => Effect.die("listOpenByKind not used by saved-search firing"),
    listByMonitorId: () => Effect.die("listByMonitorId not used by saved-search firing"),
    statsByMonitorId: () => Effect.die("statsByMonitorId not used by saved-search firing"),
    listByMonitorAlertId: () => Effect.die("listByMonitorAlertId not used by saved-search firing"),
  }

  return { repo, incidents, layer: Layer.succeed(AlertIncidentRepository, repo) }
}
