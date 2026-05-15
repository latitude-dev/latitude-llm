import { buildIdempotencyKey, type IncidentOpenedPayload } from "@domain/notifications"
import { ALERT_INCIDENT_KINDS, type AlertIncidentKind, NotificationId } from "@domain/shared"
import { and, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { alertIncidents } from "../../schema/alert-incidents.ts"
import { members } from "../../schema/better-auth.ts"
import { issues } from "../../schema/issues.ts"
import { notifications } from "../../schema/notifications.ts"
import { projects } from "../../schema/projects.ts"
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

/**
 * Spawn one in-app notification per (org member, seeded incident) so a
 * fresh `pg:seed` populates the bell with realistic data instead of an
 * empty popover. Mirrors the payload shape that the runtime
 * `requestIncidentNotificationsUseCase` + `createNotificationUseCase`
 * pipeline produces.
 *
 * One escalating incident additionally gets a synthetic `incident.closed`
 * notification (with `endedAt = now`) so the closed-event renderer is
 * also visible in the seeded feed.
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

        const issueIds = [...new Set(orgIncidents.map((i) => i.sourceId))]
        const issueRows = await ctx.db
          .select({ id: issues.id, name: issues.name })
          .from(issues)
          .where(
            and(
              eq(issues.organizationId, ctx.scope.organizationId),
              eq(issues.projectId, ctx.scope.projectId),
              inArray(issues.id, issueIds),
            ),
          )
        const issueNameById = new Map(issueRows.map((r) => [r.id, r.name]))

        const projectRow = (
          await ctx.db
            .select({ id: projects.id, slug: projects.slug })
            .from(projects)
            .where(eq(projects.id, ctx.scope.projectId))
            .limit(1)
        )[0]
        const projectSlug = projectRow?.slug

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
        let openedCount = 0
        let closedCount = 0

        for (const incident of orgIncidents) {
          const issueName = issueNameById.get(incident.sourceId)
          const payload: IncidentOpenedPayload = {
            incidentKind: incident.kind,
            alertIncidentId: incident.id,
            ...(issueName !== undefined ? { issueId: incident.sourceId, issueName } : {}),
            ...(projectSlug !== undefined ? { projectId: incident.projectId, projectSlug } : {}),
          }

          const openedKey = buildIdempotencyKey({ kind: "incident.opened", payload })
          for (const member of orgMembers) {
            rows.push({
              id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:opened`)),
              organizationId: incident.organizationId,
              userId: member.userId,
              kind: "incident.opened",
              idempotencyKey: openedKey,
              payload,
              createdAt: incident.startedAt,
              seenAt: null,
              emailedAt: null,
            })
            openedCount++
          }

          if (closedDemoIncident && incident.id === closedDemoIncident.id) {
            const closedKey = buildIdempotencyKey({ kind: "incident.closed", payload })
            for (const member of orgMembers) {
              rows.push({
                id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:closed`)),
                organizationId: incident.organizationId,
                userId: member.userId,
                kind: "incident.closed",
                idempotencyKey: closedKey,
                payload,
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
          `  -> notifications: ${rows.length} rows (${openedCount} opened, ${closedCount} closed) across ${orgMembers.length} member(s)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed notifications", cause: error }),
    }).pipe(Effect.asVoid),
}

export const notificationSeeders: readonly Seeder[] = [seedIncidentNotifications]
