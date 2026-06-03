import { SYSTEM_MONITOR_DEFINITIONS } from "@domain/monitors"
import { buildIdempotencyKey, type IncidentEventPayload } from "@domain/notifications"
import {
  ALERT_INCIDENT_KIND_LIFECYCLE,
  type AlertIncidentCondition,
  AlertIncidentId,
  type AlertIncidentKind,
  type AlertSeverity,
  DEFAULT_ESCALATION_SENSITIVITY,
  type FilterSet,
  MonitorAlertId,
  MonitorId,
  NotificationId,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import type { SeedScope } from "@domain/shared/seeding"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { alertIncidents } from "../../schema/alert-incidents.ts"
import { monitorAlerts } from "../../schema/monitor-alerts.ts"
import { monitors } from "../../schema/monitors.ts"
import { notifications } from "../../schema/notifications.ts"
import { savedSearches } from "../../schema/saved-searches.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const HOUR_MS = 60 * 60 * 1000

interface SavedSearchSeed {
  readonly key: string
  readonly slug: string
  readonly name: string
  readonly query: string | null
  readonly filterSet: FilterSet
}

const SAVED_SEARCHES: readonly SavedSearchSeed[] = [
  {
    key: "tool-errors",
    slug: "tool-errors",
    name: "Tool errors",
    query: "tool:error",
    filterSet: { "metadata.error_source": [{ op: "eq", value: "tool" }] },
  },
  {
    key: "5xx-errors",
    slug: "5xx-errors",
    name: "5xx server errors",
    query: "status:error",
    filterSet: { status: [{ op: "in", value: ["error"] }] },
  },
  {
    key: "high-latency",
    slug: "high-latency",
    name: "High latency traces",
    query: null,
    filterSet: { duration: [{ op: "gte", value: 5000 }] },
  },
  {
    key: "refund-requests",
    slug: "refund-requests",
    name: "Refund requests",
    query: "refund",
    filterSet: { "metadata.intent": [{ op: "eq", value: "refund" }] },
  },
  {
    key: "negative-feedback",
    slug: "negative-feedback",
    name: "Negative customer feedback",
    query: null,
    filterSet: { score: [{ op: "lte", value: 2 }] },
  },
  {
    key: "checkout-flow",
    slug: "checkout-flow",
    name: "Checkout flow",
    query: "checkout",
    filterSet: { "metadata.flow": [{ op: "eq", value: "checkout" }] },
  },
] as const

const savedSearchId = (scope: SeedScope, key: string): string => scope.cuid(`saved-search:${key}`)

interface UserAlertSeed {
  readonly key: string
  readonly kind: AlertIncidentKind
  readonly savedSearchKey: string
  readonly condition: AlertIncidentCondition | null
  readonly severity: AlertSeverity
  readonly incidents: number
  readonly ongoing: number
  /** Days-ago of the most-recent closed incident (older ones walk back from it). Defaults to 1. */
  readonly baseDaysAgo?: number
}

interface UserMonitorSeed {
  readonly key: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly muted: boolean
  readonly createdDaysAgo: number
  readonly alerts: readonly UserAlertSeed[]
}

const USER_MONITORS: readonly UserMonitorSeed[] = [
  {
    key: "tool-errors",
    slug: "tool-error-spikes",
    name: "Tool error spikes",
    description: "Watches the tool-call error rate and pages when it climbs past the weekly norm.",
    muted: false,
    createdDaysAgo: 48,
    alerts: [
      {
        key: "tool-errors:threshold",
        kind: "savedSearch.threshold",
        savedSearchKey: "tool-errors",
        condition: {
          kind: "savedSearch.threshold",
          threshold: {
            mode: "multiplier",
            factor: 3,
            baseline: { kind: "average", lookback: { unit: "days", days: 7 } },
          },
        },
        severity: "high",
        incidents: 180,
        ongoing: 0,
      },
    ],
  },
  {
    key: "latency-watchdog",
    slug: "latency-watchdog",
    name: "Latency watchdog",
    description: "Fires when slow traces stay elevated versus yesterday for a sustained window.",
    muted: false,
    createdDaysAgo: 36,
    alerts: [
      {
        key: "latency-watchdog:escalating",
        kind: "savedSearch.escalating",
        savedSearchKey: "high-latency",
        condition: {
          kind: "savedSearch.escalating",
          threshold: {
            mode: "multiplier",
            factor: 2,
            baseline: { kind: "period", lookback: { unit: "days", days: 1 } },
          },
          window: { minutes: 60 },
        },
        severity: "high",
        incidents: 16,
        ongoing: 3,
      },
    ],
  },
  {
    key: "error-rate-anomalies",
    slug: "error-rate-anomalies",
    name: "Error-rate anomalies",
    description: "Flags when 5xx errors stay above their seasonally-learned expected rate for a sustained window.",
    muted: false,
    createdDaysAgo: 30,
    alerts: [
      {
        key: "error-rate-anomalies:expected",
        kind: "savedSearch.escalating",
        savedSearchKey: "5xx-errors",
        condition: {
          kind: "savedSearch.escalating",
          threshold: { mode: "expected", sensitivity: 3 },
          window: { minutes: 120 },
        },
        severity: "high",
        incidents: 18,
        ongoing: 2,
      },
    ],
  },
  {
    key: "refund-spike",
    slug: "refund-spike",
    name: "Refund spike",
    description: "Absolute-count alert on refund requests. Currently muted while we triage the backlog.",
    muted: true,
    createdDaysAgo: 24,
    alerts: [
      {
        key: "refund-spike:threshold",
        kind: "savedSearch.threshold",
        savedSearchKey: "refund-requests",
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
        severity: "medium",
        incidents: 14,
        ongoing: 0,
      },
    ],
  },
  {
    key: "negative-feedback",
    slug: "negative-feedback",
    name: "Negative feedback",
    description: "Notifies on every new trace that lands in the negative-feedback saved search.",
    muted: false,
    createdDaysAgo: 19,
    alerts: [
      {
        key: "negative-feedback:match",
        kind: "savedSearch.match",
        savedSearchKey: "negative-feedback",
        condition: null,
        severity: "low",
        incidents: 22,
        ongoing: 0,
      },
    ],
  },
  {
    key: "customer-experience",
    slug: "customer-experience",
    name: "Customer experience",
    description: "Multi-alert monitor covering the checkout flow from three different angles.",
    muted: false,
    createdDaysAgo: 12,
    alerts: [
      {
        key: "customer-experience:match",
        kind: "savedSearch.match",
        savedSearchKey: "checkout-flow",
        condition: null,
        severity: "low",
        incidents: 9,
        ongoing: 0,
      },
      {
        key: "customer-experience:expected",
        kind: "savedSearch.threshold",
        savedSearchKey: "checkout-flow",
        condition: { kind: "savedSearch.threshold", threshold: { mode: "expected", sensitivity: 4 } },
        severity: "medium",
        incidents: 11,
        ongoing: 0,
      },
      {
        key: "customer-experience:escalating",
        kind: "savedSearch.escalating",
        savedSearchKey: "5xx-errors",
        condition: {
          kind: "savedSearch.escalating",
          threshold: { mode: "absolute", count: 2000 },
          window: { minutes: 5 },
        },
        severity: "high",
        incidents: 8,
        ongoing: 2,
      },
    ],
  },
  {
    key: "checkout-latency-regression",
    slug: "checkout-latency-regression",
    name: "Checkout latency regression",
    description:
      "Resolved over a week ago — every incident is closed and stale, so it surfaces the muted 'last incident' state on the dashboard and an all-muted incidents table.",
    muted: false,
    createdDaysAgo: 45,
    alerts: [
      {
        key: "checkout-latency-regression:threshold",
        kind: "savedSearch.threshold",
        savedSearchKey: "high-latency",
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 50 } },
        severity: "medium",
        incidents: 20,
        ongoing: 0,
        baseDaysAgo: 10,
      },
    ],
  },
  {
    key: "latency-canary",
    slug: "latency-canary",
    name: "Latency canary",
    description: "Brand-new monitor with no incidents yet — exercises the empty incidents table.",
    muted: false,
    createdDaysAgo: 1,
    alerts: [
      {
        key: "latency-canary:match",
        kind: "savedSearch.match",
        savedSearchKey: "high-latency",
        condition: null,
        severity: "low",
        incidents: 0,
        ongoing: 0,
      },
    ],
  },
] as const

/** Descending, mostly-distinct started-at for incident `i` so the keyset `(started_at DESC, id DESC)` paginates cleanly. */
const historicalStartedAt = (scope: SeedScope, i: number, baseDaysAgo = 1): Date =>
  scope.dateDaysAgo(baseDaysAgo + Math.floor(i / 12), (i % 12) * 2, (i * 13) % 60)

interface GeneratedIncidents {
  readonly incidentRows: (typeof alertIncidents.$inferInsert)[]
  readonly notificationRows: (typeof notifications.$inferInsert)[]
}

const buildAlertIncidents = (input: {
  readonly scope: SeedScope
  readonly alert: UserAlertSeed
  readonly monitorAlertId: string
  readonly muted: boolean
  readonly notifyUserId: string
}): GeneratedIncidents => {
  const { scope, alert, monitorAlertId, muted, notifyUserId } = input
  const sourceId = savedSearchId(scope, alert.savedSearchKey)
  const sustained = ALERT_INCIDENT_KIND_LIFECYCLE[alert.kind] === "sustained"
  const incidentRows: (typeof alertIncidents.$inferInsert)[] = []
  const notificationRows: (typeof notifications.$inferInsert)[] = []

  for (let i = 0; i < alert.incidents; i++) {
    const id = AlertIncidentId(scope.cuid(`monitor-incident:${alert.key}:${i}`))
    const isOngoing = sustained && i < alert.ongoing
    // Ongoing rows sit at the recent edge so they sort to the top.
    const startedAt = isOngoing ? scope.dateDaysAgo(i, 8, 0) : historicalStartedAt(scope, i, alert.baseDaysAgo)
    const endedAt = isOngoing ? null : sustained ? new Date(startedAt.getTime() + 2 * HOUR_MS) : startedAt

    incidentRows.push({
      id,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourceType: "savedSearch",
      sourceId,
      kind: alert.kind,
      severity: alert.severity,
      startedAt,
      endedAt,
      monitorAlertId,
      condition: alert.condition,
    })

    // Muted monitors get no notification row, so their incidents all show "Muted". Markers go to a non-primary member so the owner's bell stays clean.
    if (!muted && i % 3 === 0) {
      const payload: IncidentEventPayload = {
        alertIncidentId: id,
        sourceType: "savedSearch",
        sourceId,
        incidentKind: alert.kind,
        severity: alert.severity,
      }
      notificationRows.push({
        id: NotificationId(scope.cuid(`monitor-notif:${id}`)),
        organizationId: scope.organizationId,
        userId: notifyUserId,
        kind: "incident.event",
        idempotencyKey: buildIdempotencyKey({ kind: "incident.event", payload }),
        projectId: scope.projectId,
        payload,
        createdAt: startedAt,
        seenAt: null,
        emailedAt: null,
      })
    }
  }

  return { incidentRows, notificationRows }
}

/** Reuses already-provisioned system monitor/alert ids (matched by slug + kind), inserting only what's missing, so it's safe whether or not provisioning ran first. */
const ensureSystemMonitors = async (ctx: SeedContext): Promise<Map<AlertIncidentKind, string>> => {
  const { scope } = ctx
  const existingMonitors = await ctx.db
    .select({ id: monitors.id, slug: monitors.slug })
    .from(monitors)
    .where(and(eq(monitors.projectId, scope.projectId), eq(monitors.system, true), isNull(monitors.deletedAt)))
  const monitorIdBySlug = new Map(existingMonitors.map((m) => [m.slug, m.id]))

  const existingAlerts = existingMonitors.length
    ? await ctx.db
        .select({ id: monitorAlerts.id, monitorId: monitorAlerts.monitorId, kind: monitorAlerts.kind })
        .from(monitorAlerts)
        .where(
          inArray(
            monitorAlerts.monitorId,
            existingMonitors.map((m) => m.id),
          ),
        )
    : []
  const alertIdByMonitorKind = new Map(existingAlerts.map((a) => [`${a.monitorId}:${a.kind}`, a.id]))

  const now = scope.dateDaysAgo(60, 12, 0)
  const alertIdByKind = new Map<AlertIncidentKind, string>()

  for (const definition of SYSTEM_MONITOR_DEFINITIONS) {
    let monitorId = monitorIdBySlug.get(definition.slug)
    if (!monitorId) {
      monitorId = MonitorId(scope.cuid(`monitor:system:${definition.slug}`))
      await ctx.db
        .insert(monitors)
        .values({
          id: monitorId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          slug: definition.slug,
          name: definition.name,
          description: definition.description,
          system: true,
          mutedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }

    for (const alert of definition.alerts) {
      let alertId = alertIdByMonitorKind.get(`${monitorId}:${alert.kind}`)
      if (!alertId) {
        alertId = MonitorAlertId(scope.cuid(`monitor-alert:system:${definition.slug}:${alert.kind}`))
        await ctx.db
          .insert(monitorAlerts)
          .values({
            id: alertId,
            organizationId: scope.organizationId,
            monitorId,
            kind: alert.kind,
            sourceType: alert.source.type,
            sourceId: alert.source.id,
            condition: alert.condition,
            // Mirrors the provision use-case: system severity is a pure function of kind.
            severity: SEVERITY_FOR_KIND[alert.kind],
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
      }
      alertIdByKind.set(alert.kind, alertId)
    }
  }

  return alertIdByKind
}

const seedMonitors: Seeder = {
  name: "monitors/dashboard-fixtures",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const { scope } = ctx
        const notifyUserId = scope.queueAssigneeUserIds.at(-1) ?? scope.queueAssigneeUserIds[0]
        if (!notifyUserId) {
          throw new Error("monitors seeder requires at least one org member to attribute notifications to")
        }
        const ownerUserId = scope.queueAssigneeUserIds[0] ?? notifyUserId

        for (const search of SAVED_SEARCHES) {
          const row: typeof savedSearches.$inferInsert = {
            id: savedSearchId(scope, search.key),
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            slug: search.slug,
            name: search.name,
            query: search.query,
            filterSet: search.filterSet,
            assignedUserId: null,
            createdByUserId: ownerUserId,
            deletedAt: null,
          }
          const { id, ...set } = row
          await ctx.db.insert(savedSearches).values(row).onConflictDoUpdate({ target: savedSearches.id, set })
        }

        // Backfill existing issue incidents onto the system-monitor alerts so their panels show live data.
        const systemAlertIdByKind = await ensureSystemMonitors(ctx)
        let backfilled = 0
        for (const definition of SYSTEM_MONITOR_DEFINITIONS) {
          for (const alert of definition.alerts) {
            const alertId = systemAlertIdByKind.get(alert.kind)
            if (!alertId) continue
            await ctx.db
              .update(alertIncidents)
              .set({
                monitorAlertId: alertId,
                // Snapshot the condition for escalating; the point kinds have none.
                ...(alert.condition
                  ? { condition: { kind: "issue.escalating", sensitivity: DEFAULT_ESCALATION_SENSITIVITY } }
                  : {}),
              })
              .where(
                and(
                  eq(alertIncidents.organizationId, scope.organizationId),
                  eq(alertIncidents.projectId, scope.projectId),
                  eq(alertIncidents.kind, alert.kind),
                  isNull(alertIncidents.monitorAlertId),
                ),
              )
            backfilled++
          }
        }

        const incidentRows: (typeof alertIncidents.$inferInsert)[] = []
        const notificationRows: (typeof notifications.$inferInsert)[] = []
        let alertCount = 0

        for (const monitor of USER_MONITORS) {
          const monitorId = MonitorId(scope.cuid(`monitor:${monitor.key}`))
          const createdAt = scope.dateDaysAgo(monitor.createdDaysAgo, 10, 0)
          const monitorRow: typeof monitors.$inferInsert = {
            id: monitorId,
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            slug: monitor.slug,
            name: monitor.name,
            description: monitor.description,
            system: false,
            mutedAt: monitor.muted ? scope.dateDaysAgo(3, 15, 0) : null,
            deletedAt: null,
            createdAt,
            updatedAt: createdAt,
          }
          const { id: mId, ...mSet } = monitorRow
          await ctx.db.insert(monitors).values(monitorRow).onConflictDoUpdate({ target: monitors.id, set: mSet })

          for (const alert of monitor.alerts) {
            const monitorAlertId = MonitorAlertId(scope.cuid(`monitor-alert:${alert.key}`))
            const alertRow: typeof monitorAlerts.$inferInsert = {
              id: monitorAlertId,
              organizationId: scope.organizationId,
              monitorId,
              kind: alert.kind,
              sourceType: "savedSearch",
              sourceId: savedSearchId(scope, alert.savedSearchKey),
              condition: alert.condition,
              severity: alert.severity,
              deletedAt: null,
              createdAt,
              updatedAt: createdAt,
            }
            const { id: aId, ...aSet } = alertRow
            await ctx.db
              .insert(monitorAlerts)
              .values(alertRow)
              .onConflictDoUpdate({ target: monitorAlerts.id, set: aSet })
            alertCount++

            const generated = buildAlertIncidents({
              scope,
              alert,
              monitorAlertId,
              muted: monitor.muted,
              notifyUserId,
            })
            incidentRows.push(...generated.incidentRows)
            notificationRows.push(...generated.notificationRows)
          }
        }

        for (const row of incidentRows) {
          const { id, ...set } = row
          await ctx.db.insert(alertIncidents).values(row).onConflictDoUpdate({ target: alertIncidents.id, set })
        }
        for (const row of notificationRows) {
          await ctx.db.insert(notifications).values(row).onConflictDoNothing()
        }

        console.log(
          `  -> monitors: ${SAVED_SEARCHES.length} saved searches, ${SYSTEM_MONITOR_DEFINITIONS.length} system + ${USER_MONITORS.length} user monitors (${alertCount} user alerts), ${incidentRows.length} saved-search incidents (+${backfilled} issue-incident kinds backfilled onto system monitors), ${notificationRows.length} notification markers`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed monitors", cause: error }),
    }).pipe(Effect.asVoid),
}

export const monitorSeeders: readonly Seeder[] = [seedMonitors]
