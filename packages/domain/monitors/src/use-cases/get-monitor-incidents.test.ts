import { type AlertIncident, AlertIncidentRepository, type AlertIncidentRepositoryShape } from "@domain/alerts"
import {
  type Notification,
  NotificationRepository,
  type NotificationRepositoryShape,
  notificationKindSchema,
} from "@domain/notifications"
import { createFakeNotificationRepository } from "@domain/notifications/testing"
import {
  AlertIncidentId,
  MonitorId,
  NotificationId,
  OrganizationId,
  ProjectId,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getMonitorIncidentsUseCase } from "./get-monitor-incidents.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))

const makeIncident = (overrides: Partial<AlertIncident> & { id: AlertIncident["id"] }): AlertIncident => ({
  id: overrides.id,
  organizationId,
  projectId,
  sourceType: "issue",
  sourceId: "i".repeat(24),
  kind: "issue.new",
  severity: "medium",
  startedAt: overrides.startedAt ?? new Date("2026-05-29T10:00:00.000Z"),
  endedAt: overrides.endedAt ?? null,
  createdAt: overrides.createdAt ?? new Date("2026-05-29T10:00:00.000Z"),
  entrySignals: null,
  exitEligibleSince: null,
  monitorAlertId: overrides.monitorAlertId ?? null,
  condition: overrides.condition ?? null,
})

const makeNotification = (
  overrides: Partial<Notification> & { id: Notification["id"]; idempotencyKey: string },
): Notification => ({
  id: overrides.id,
  organizationId,
  userId: UserId("u".repeat(24)),
  kind: notificationKindSchema.parse("incident.event"),
  idempotencyKey: overrides.idempotencyKey,
  projectId,
  payload: {},
  createdAt: new Date("2026-05-29T10:01:00.000Z"),
  seenAt: null,
  emailedAt: null,
})

const buildIncidentRepo = (page: {
  items: readonly AlertIncident[]
  nextCursor: { endedAt: Date | null; id: AlertIncident["id"] } | null
  hasMore: boolean
}): AlertIncidentRepositoryShape => ({
  insert: () => Effect.die("insert not used"),
  findById: () => Effect.die("findById not used"),
  findOpen: () => Effect.die("findOpen not used"),
  closeOpen: () => Effect.die("closeOpen not used"),
  updateExitDwell: () => Effect.die("updateExitDwell not used"),
  listByProjectId: () => Effect.die("listByProjectId not used"),
  listOpenByKind: () => Effect.die("listOpenByKind not used"),
  listByMonitorId: () => Effect.succeed(page),
  statsByMonitorId: () => Effect.die("statsByMonitorId not used"),
  listByMonitorAlertId: () => Effect.die("listByMonitorAlertId not used"),
})

const provideLayer = (incidentRepo: AlertIncidentRepositoryShape, notificationRepo: NotificationRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(AlertIncidentRepository, AlertIncidentRepository.of(incidentRepo)),
    Layer.succeed(NotificationRepository, NotificationRepository.of(notificationRepo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

describe("getMonitorIncidentsUseCase", () => {
  it("returns an empty list when the monitor has no incidents", async () => {
    const { repo: notificationRepo } = createFakeNotificationRepository()
    const incidentRepo = buildIncidentRepo({ items: [], nextCursor: null, hasMore: false })

    const result = await Effect.runPromise(
      getMonitorIncidentsUseCase({ organizationId, monitorId }).pipe(
        Effect.provide(provideLayer(incidentRepo, notificationRepo)),
      ),
    )

    expect(result.items).toEqual([])
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it("marks an incident as notified when any of its three idempotency keys has a notification row", async () => {
    const incidentA = makeIncident({ id: AlertIncidentId("a".repeat(24)) })
    const incidentB = makeIncident({ id: AlertIncidentId("b".repeat(24)) })

    const { repo: notificationRepo, rows } = createFakeNotificationRepository()
    rows.push(
      makeNotification({
        id: NotificationId("n".repeat(24)),
        idempotencyKey: `incident.event:${incidentA.id}`,
      }),
    )

    const incidentRepo = buildIncidentRepo({
      items: [incidentA, incidentB],
      nextCursor: null,
      hasMore: false,
    })

    const result = await Effect.runPromise(
      getMonitorIncidentsUseCase({ organizationId, monitorId }).pipe(
        Effect.provide(provideLayer(incidentRepo, notificationRepo)),
      ),
    )

    expect(result.items.map((i) => ({ id: i.incident.id, notified: i.notified }))).toEqual([
      { id: incidentA.id, notified: true },
      { id: incidentB.id, notified: false },
    ])
  })

  it("treats incident.opened and incident.closed keys as also marking the incident notified", async () => {
    const incident = makeIncident({ id: AlertIncidentId("c".repeat(24)) })

    const { repo: notificationRepo, rows } = createFakeNotificationRepository()
    rows.push(
      makeNotification({
        id: NotificationId("n".repeat(24)),
        idempotencyKey: `incident.opened:${incident.id}`,
      }),
    )

    const incidentRepo = buildIncidentRepo({
      items: [incident],
      nextCursor: null,
      hasMore: false,
    })

    const result = await Effect.runPromise(
      getMonitorIncidentsUseCase({ organizationId, monitorId }).pipe(
        Effect.provide(provideLayer(incidentRepo, notificationRepo)),
      ),
    )

    expect(result.items[0]?.notified).toBe(true)
  })

  it("does not consider notifications from a different organization", async () => {
    const incident = makeIncident({ id: AlertIncidentId("d".repeat(24)) })

    const { repo: notificationRepo, rows } = createFakeNotificationRepository()
    rows.push({
      ...makeNotification({
        id: NotificationId("n".repeat(24)),
        idempotencyKey: `incident.event:${incident.id}`,
      }),
      organizationId: OrganizationId("z".repeat(24)),
    })

    const incidentRepo = buildIncidentRepo({
      items: [incident],
      nextCursor: null,
      hasMore: false,
    })

    const result = await Effect.runPromise(
      getMonitorIncidentsUseCase({ organizationId, monitorId }).pipe(
        Effect.provide(provideLayer(incidentRepo, notificationRepo)),
      ),
    )

    expect(result.items[0]?.notified).toBe(false)
  })
})
