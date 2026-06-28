import { type Incident, IncidentRepository, type IncidentRepositoryShape } from "@domain/incidents"
import { Effect, Layer } from "effect"

export const createFakeAlertIncidentStore = (seed: readonly Incident[] = []) => {
  const incidents: Incident[] = [...seed]

  const patch = (id: string, next: Partial<Incident>) => {
    const index = incidents.findIndex((incident) => incident.id === id)
    const current = incidents[index]
    if (current) incidents[index] = { ...current, ...next }
  }

  const repo: IncidentRepositoryShape = {
    insert: (incident) =>
      Effect.sync(() => {
        incidents.push(incident)
      }),
    findOpen: ({ sourceType, sourceId }) =>
      Effect.sync(
        () =>
          incidents.find(
            (incident) =>
              incident.sourceType === sourceType && incident.sourceId === sourceId && incident.endedAt === null,
          ) ?? null,
      ),
    closeOpen: ({ sourceType, sourceId, endedAt }) =>
      Effect.sync(() => {
        const incident = incidents.find(
          (candidate) =>
            candidate.sourceType === sourceType && candidate.sourceId === sourceId && candidate.endedAt === null,
        )
        if (!incident) return null
        patch(incident.id, { endedAt })
        return incident.id
      }),
    updateExitDwell: ({ id, exitEligibleSince }) => Effect.sync(() => patch(id, { exitEligibleSince })),
    setEndedAt: ({ id, endedAt }) => Effect.sync(() => patch(id, { endedAt })),
    findById: () => Effect.die("findById not used by monitor firing"),
    closeById: () => Effect.die("closeById not used by monitor firing"),
    listByProjectId: () => Effect.die("listByProjectId not used by monitor firing"),
    listOpenBySourceType: () => Effect.die("listOpenBySourceType not used by monitor firing"),
    listByMonitorId: () => Effect.die("listByMonitorId not used by monitor firing"),
    statsByMonitorId: () => Effect.die("statsByMonitorId not used by monitor firing"),
  }

  return { repo, incidents, layer: Layer.succeed(IncidentRepository, repo) }
}
