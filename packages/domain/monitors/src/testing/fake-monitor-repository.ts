import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import type { MonitorListPage, MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const isLive = (monitor: Monitor) => monitor.deletedAt === null

export const createFakeMonitorRepository = (seed: readonly Monitor[] = []) => {
  const monitors: Monitor[] = [...seed]

  const liveById = (id: string) => monitors.find((monitor) => monitor.id === id && isLive(monitor))
  const replace = (id: string, next: Monitor) => {
    const index = monitors.findIndex((monitor) => monitor.id === id)
    if (index >= 0) monitors[index] = next
  }

  const repo: MonitorRepositoryShape = {
    findById: (id) =>
      Effect.suspend(() => {
        const monitor = liveById(id)
        return monitor ? Effect.succeed(monitor) : Effect.fail(new NotFoundError({ entity: "Monitor", id }))
      }),
    findBySlug: ({ projectId, slug }) =>
      Effect.suspend(() => {
        const monitor = monitors.find((m) => m.projectId === projectId && m.slug === slug && isLive(m))
        return monitor ? Effect.succeed(monitor) : Effect.fail(new NotFoundError({ entity: "Monitor", id: slug }))
      }),
    list: ({ projectId, limit, offset, searchQuery }) =>
      Effect.sync<MonitorListPage>(() => {
        const query = searchQuery?.toLowerCase()
        const all = monitors
          .filter((m) => m.projectId === projectId && isLive(m))
          .filter((m) => (query ? m.name.toLowerCase().includes(query) : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        const items = all.slice(offset, offset + limit)
        return {
          items,
          lastIncidentByMonitorId: new Map(),
          totalCount: all.length,
          hasMore: offset + items.length < all.length,
          limit,
          offset,
        }
      }),
    searchOrgWide: ({ searchQuery, limit }) =>
      Effect.sync(() => {
        const query = searchQuery?.trim().toLowerCase()
        return monitors
          .filter(isLive)
          .filter((m) => (query ? m.name.toLowerCase().includes(query) : true))
          .slice(0, limit)
          .map((m) => ({
            id: m.id,
            projectId: m.projectId,
            projectSlug: `project-${m.projectId}`,
            projectName: `Project ${m.projectId}`,
            slug: m.slug,
            name: m.name,
            system: m.system,
            mutedAt: m.mutedAt,
          }))
      }),
    create: (monitor) =>
      Effect.sync(() => {
        monitors.push(monitor)
      }),
    save: (monitor) =>
      Effect.suspend(() => {
        if (!liveById(monitor.id)) return Effect.fail(new NotFoundError({ entity: "Monitor", id: monitor.id }))
        replace(monitor.id, monitor)
        return Effect.void
      }),
    setMuted: ({ id, mutedAt }) =>
      Effect.suspend(() => {
        const monitor = liveById(id)
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "Monitor", id }))
        replace(id, { ...monitor, mutedAt, updatedAt: new Date() })
        return Effect.void
      }),
    softDelete: (id) =>
      Effect.suspend(() => {
        const monitor = liveById(id)
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "Monitor", id }))
        replace(id, { ...monitor, deletedAt: new Date(), updatedAt: new Date() })
        return Effect.void
      }),
    updateMetadata: ({ id, name, slug, description }) =>
      Effect.suspend(() => {
        const monitor = liveById(id)
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "Monitor", id }))
        replace(id, { ...monitor, name, slug, description, updatedAt: new Date() })
        return Effect.void
      }),
    listActiveMonitors: ({ projectId, targetType, trigger }) =>
      Effect.sync(() =>
        monitors.filter(
          (m) =>
            m.projectId === projectId &&
            isLive(m) &&
            (targetType === undefined || m.target.type === targetType) &&
            (trigger === undefined || m.rule.trigger === trigger),
        ),
      ),
    lockMonitorForUpdate: () => Effect.void,
    listMonitorsForTarget: ({ projectId, targetType, filterSetContains }) =>
      Effect.sync(() =>
        monitors
          .filter((m) => m.projectId === projectId && isLive(m))
          .filter((m) => targetType === undefined || m.target.type === targetType)
          .filter((m) => {
            const filterSet = m.target.filterSet ?? {}
            return Object.entries(filterSetContains).every(([field, conditions]) =>
              conditions.every((condition) =>
                (filterSet[field] ?? []).some(
                  (existing) => existing.op === condition.op && existing.value === condition.value,
                ),
              ),
            )
          }),
      ),
    listSavedSearchMonitorSummaries: (projectId) =>
      Effect.sync(() =>
        monitors
          .filter((m) => m.projectId === projectId && isLive(m) && m.target.type === "savedSearch" && m.target.id)
          .map((monitor) => ({
            savedSearchId: monitor.target.id as string,
            monitorSlug: monitor.slug,
            monitorCount: 1,
            severities: [monitor.rule.severity],
            monitors: [
              {
                slug: monitor.slug,
                name: monitor.name,
                muted: monitor.mutedAt !== null,
                severities: [monitor.rule.severity],
              },
            ],
          })),
      ),
    listProjectsWithActiveMonitors: () =>
      Effect.sync(() => {
        const seen = new Map<string, { organizationId: Monitor["organizationId"]; projectId: Monitor["projectId"] }>()
        for (const monitor of monitors) {
          if (!isLive(monitor)) continue
          seen.set(`${monitor.organizationId}:${monitor.projectId}`, {
            organizationId: monitor.organizationId,
            projectId: monitor.projectId,
          })
        }
        return [...seen.values()]
      }),
    countActiveBySlug: ({ projectId, slug, excludeId }) =>
      Effect.sync(
        () =>
          monitors.filter((m) => m.projectId === projectId && m.slug === slug && m.id !== excludeId && isLive(m))
            .length,
      ),
  }

  return { repo, monitors }
}
