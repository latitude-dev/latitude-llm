import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import type { MonitorListPage, MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const isLive = (monitor: Monitor) => monitor.deletedAt === null

/**
 * In-memory MonitorRepository for unit tests. Seed via the argument and
 * assert against the returned `monitors` array, which mutations write
 * through. Mirrors the live repo's org/slug/deleted-aware semantics: reads
 * ignore soft-deleted rows; `provisionSystemMonitors` inserts only missing
 * `(projectId, slug)`; `countActiveBySlug` excludes the target + deleted rows;
 * `updateAlert` patches the alert across whichever live monitor owns it.
 *
 * The alert-level `deleted_at` cascade on `softDelete` isn't modelled — the
 * `MonitorAlert` entity has no `deletedAt`; the fake just marks the monitor.
 */
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
          .sort((a, b) => {
            if (a.system !== b.system) return a.system ? -1 : 1
            if (a.createdAt.getTime() !== b.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime()
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
          })
        const items = all.slice(offset, offset + limit)
        // The fake doesn't model incidents; last-incident behavior is covered by the live repo.
        return {
          items,
          lastIncidentByMonitorId: new Map(),
          totalCount: all.length,
          hasMore: offset + items.length < all.length,
          limit,
          offset,
        }
      }),
    provisionSystemMonitors: (toProvision) =>
      Effect.sync(() => {
        const inserted: Monitor[] = []
        for (const monitor of toProvision) {
          if (monitors.some((m) => m.projectId === monitor.projectId && m.slug === monitor.slug && isLive(m))) continue
          monitors.push(monitor)
          inserted.push(monitor)
        }
        return inserted
      }),
    resetSystemMonitors: (toReset) =>
      Effect.sync(() => {
        const reset: Monitor[] = []
        for (const monitor of toReset) {
          const existing = monitors.find(
            (m) => m.projectId === monitor.projectId && m.slug === monitor.slug && isLive(m),
          )
          if (existing && !existing.system) continue
          if (existing) {
            replace(existing.id, {
              ...existing,
              name: monitor.name,
              description: monitor.description,
              alerts: monitor.alerts.map((alert) => ({ ...alert, monitorId: existing.id })),
              updatedAt: new Date(),
            })
          } else {
            monitors.push(monitor)
          }
          reset.push(monitor)
        }
        return reset
      }),
    create: (monitor) =>
      Effect.sync(() => {
        monitors.push(monitor)
      }),
    insertAlert: (alert) =>
      Effect.sync(() => {
        // Plain insert, mirroring the live repo: the use-case loads the owning
        // monitor in the same transaction, so it's expected to exist.
        const monitor = monitors.find((m) => m.id === alert.monitorId && isLive(m))
        if (monitor) replace(monitor.id, { ...monitor, alerts: [...monitor.alerts, alert] })
      }),
    softDeleteAlert: (alertId) =>
      Effect.suspend(() => {
        const monitor = monitors.find((m) => isLive(m) && m.alerts.some((alert) => alert.id === alertId))
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "MonitorAlert", id: alertId }))
        // Alert-level soft delete isn't modelled (the entity has no `deletedAt`);
        // dropping it from the live list mirrors what reads would return.
        replace(monitor.id, { ...monitor, alerts: monitor.alerts.filter((alert) => alert.id !== alertId) })
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
        const now = new Date()
        replace(id, { ...monitor, deletedAt: now, updatedAt: now })
        return Effect.void
      }),
    updateMetadata: ({ id, name, slug, description }) =>
      Effect.suspend(() => {
        const monitor = liveById(id)
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "Monitor", id }))
        replace(id, { ...monitor, name, slug, description, updatedAt: new Date() })
        return Effect.void
      }),
    updateAlert: ({ alertId, kind, sourceId, condition, severity }) =>
      Effect.suspend(() => {
        const monitor = monitors.find((m) => isLive(m) && m.alerts.some((alert) => alert.id === alertId))
        if (!monitor) return Effect.fail(new NotFoundError({ entity: "MonitorAlert", id: alertId }))
        replace(monitor.id, {
          ...monitor,
          alerts: monitor.alerts.map((alert) =>
            alert.id === alertId
              ? { ...alert, kind, source: { ...alert.source, id: sourceId }, condition, severity }
              : alert,
          ),
        })
        return Effect.void
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
