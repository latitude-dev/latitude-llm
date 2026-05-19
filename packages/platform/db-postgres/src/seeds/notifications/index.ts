import {
  buildIdempotencyKey,
  type IncidentClosedPayload,
  type IncidentEventPayload,
  type IncidentOpenedPayload,
  type IncidentTrend,
} from "@domain/notifications"
import { ALERT_INCIDENT_KINDS, type AlertIncidentKind, NotificationId, SEVERITY_FOR_KIND } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { alertIncidents } from "../../schema/alert-incidents.ts"
import { members } from "../../schema/better-auth.ts"
import { notifications } from "../../schema/notifications.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

interface IncidentRow {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly sourceId: string
  readonly kind: AlertIncidentKind
  readonly startedAt: Date
  readonly endedAt: Date | null
}

const isAlertIncidentKind = (k: string): k is AlertIncidentKind =>
  (ALERT_INCIDENT_KINDS as readonly string[]).includes(k)

const TREND_BUCKET_MS = 10 * 60 * 1000
const TREND_POINTS = 18

/**
 * Synthetic trend block matching what `requestIncidentNotificationsUseCase`
 * snapshots for sustained kinds: 18 points × 10-min buckets ending at the
 * transition timestamp. Counts ramp up toward the trailing edge for an
 * opened-side feel; thresholds sit slightly above the ramp peak so the
 * dashed line stays visible across all buckets. Pure cosmetic seed data —
 * the runtime uses ClickHouse aggregates.
 */
const buildSyntheticTrend = (anchor: Date): IncidentTrend => {
  const anchorMs = anchor.getTime()
  const points = Array.from({ length: TREND_POINTS }, (_, i) => {
    const tMs = anchorMs - (TREND_POINTS - 1 - i) * TREND_BUCKET_MS
    // Bell-curve-ish ramp: low → high → settle. Mostly cosmetic.
    const ramp = Math.max(0, i - 4)
    const count = Math.round(2 + ramp * 1.5)
    const threshold = 8 + Math.sin(i / 3) * 1.2
    return { t: new Date(tMs).toISOString(), count, threshold }
  })
  return { bucketDurationMs: TREND_BUCKET_MS, points }
}

/**
 * Spawn one in-app notification per (org member, seeded incident) so a
 * fresh `pg:seed` populates the bell with realistic data instead of an
 * empty popover. Mirrors the payload shape that the runtime
 * `requestIncidentNotificationsUseCase` + `createNotificationUseCase`
 * pipeline produces:
 *
 * - Eventful kinds (issue.new, issue.regressed) get `incident.event`.
 * - The escalating incident gets `incident.opened` plus a synthetic
 *   `incident.closed` (with `endedAt` stamped now) so both sustained
 *   renderers are visible in the seeded feed.
 */
const seedIncidentNotifications: Seeder = {
  name: "notifications/incident-fanout",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const orgIncidentsRaw = await ctx.db
          .select()
          .from(alertIncidents)
          .where(eq(alertIncidents.organizationId, ctx.scope.organizationId))
        const orgIncidents: IncidentRow[] = orgIncidentsRaw
          .filter((r) => isAlertIncidentKind(r.kind))
          .map((r) => ({
            id: r.id,
            organizationId: r.organizationId,
            projectId: r.projectId,
            sourceId: r.sourceId,
            kind: r.kind as AlertIncidentKind,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
          }))

        if (orgIncidents.length === 0) {
          console.log("  -> notifications: no seeded incidents to fan out from, skipping")
          return
        }

        const orgMembers = await ctx.db
          .select({ userId: members.userId })
          .from(members)
          .where(eq(members.organizationId, ctx.scope.organizationId))

        if (orgMembers.length === 0) {
          console.log("  -> notifications: no org members to deliver to, skipping")
          return
        }

        // Stamp endedAt on the seeded escalating incident so the closed-side
        // notification has a real transition timestamp to anchor the trend.
        const closedDemoIncident = orgIncidents.find((i) => i.kind === "issue.escalating")
        const now = new Date()
        const closedAt = new Date(now.getTime() - 30 * 60 * 1000)
        if (closedDemoIncident) {
          await ctx.db
            .update(alertIncidents)
            .set({ endedAt: closedAt })
            .where(eq(alertIncidents.id, closedDemoIncident.id))
        }

        const rows: (typeof notifications.$inferInsert)[] = []
        let eventCount = 0
        let openedCount = 0
        let closedCount = 0

        for (const incident of orgIncidents) {
          const isSustained = incident.kind === "issue.escalating"
          const severity = SEVERITY_FOR_KIND[incident.kind]

          if (!isSustained) {
            // Eventful kinds (issue.new, issue.regressed) → incident.event
            const payload: IncidentEventPayload = {
              alertIncidentId: incident.id,
              sourceType: "issue",
              sourceId: incident.sourceId,
              incidentKind: incident.kind,
              severity,
            }
            const idempotencyKey = buildIdempotencyKey({ kind: "incident.event", payload })
            for (const member of orgMembers) {
              rows.push({
                id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:event`)),
                organizationId: incident.organizationId,
                userId: member.userId,
                kind: "incident.event",
                idempotencyKey,
                projectId: incident.projectId,
                payload,
                createdAt: incident.startedAt,
                seenAt: null,
                emailedAt: null,
              })
              eventCount++
            }
            continue
          }

          // issue.escalating → opened (+ closed for the demo incident)
          const openedPayload: IncidentOpenedPayload = {
            alertIncidentId: incident.id,
            sourceType: "issue",
            sourceId: incident.sourceId,
            incidentKind: incident.kind,
            severity,
            trend: buildSyntheticTrend(incident.startedAt),
          }
          const openedKey = buildIdempotencyKey({ kind: "incident.opened", payload: openedPayload })
          for (const member of orgMembers) {
            rows.push({
              id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:opened`)),
              organizationId: incident.organizationId,
              userId: member.userId,
              kind: "incident.opened",
              idempotencyKey: openedKey,
              projectId: incident.projectId,
              payload: openedPayload,
              createdAt: incident.startedAt,
              seenAt: null,
              emailedAt: null,
            })
            openedCount++
          }

          if (closedDemoIncident && incident.id === closedDemoIncident.id) {
            const closedPayload: IncidentClosedPayload = {
              alertIncidentId: incident.id,
              sourceType: "issue",
              sourceId: incident.sourceId,
              incidentKind: incident.kind,
              severity,
              trend: buildSyntheticTrend(closedAt),
              recovery: { durationMs: closedAt.getTime() - incident.startedAt.getTime() },
            }
            const closedKey = buildIdempotencyKey({ kind: "incident.closed", payload: closedPayload })
            for (const member of orgMembers) {
              rows.push({
                id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:closed`)),
                organizationId: incident.organizationId,
                userId: member.userId,
                kind: "incident.closed",
                idempotencyKey: closedKey,
                projectId: incident.projectId,
                payload: closedPayload,
                createdAt: closedAt,
                seenAt: null,
                emailedAt: null,
              })
              closedCount++
            }
          }
        }

        for (const row of rows) {
          // Match the runtime unique index: drop dupes silently so
          // re-running the seeder is idempotent.
          await ctx.db.insert(notifications).values(row).onConflictDoNothing()
        }

        console.log(
          `  -> notifications: ${rows.length} rows (${eventCount} event, ${openedCount} opened, ${closedCount} closed) across ${orgMembers.length} member(s)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed notifications", cause: error }),
    }).pipe(Effect.asVoid),
}

export const notificationSeeders: readonly Seeder[] = [seedIncidentNotifications]
