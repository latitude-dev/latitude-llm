import { NotificationId } from "@domain/shared"
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
  readonly kind: string
  readonly startedAt: Date
  readonly endedAt: Date | null
}

/**
 * Spawn one in-app notification per (org member, seeded incident) so a
 * fresh `pg:seed` populates the bell with realistic data instead of an
 * empty popover. Mirrors the payload shape that
 * `createIncidentNotificationsUseCase` produces at runtime.
 *
 * One escalating incident additionally gets a synthetic "closed"
 * notification (with `endedAt = now`) so the closed-event renderer is
 * also visible in the seeded feed. The underlying `alert_incidents` row
 * stays open (`ended_at = NULL`) — only the notification simulates the
 * closure for visual demo purposes.
 */
const seedIncidentNotifications: Seeder = {
  name: "notifications/incident-fanout",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const orgIncidents = (await ctx.db
          .select()
          .from(alertIncidents)
          .where(eq(alertIncidents.organizationId, ctx.scope.organizationId))) as IncidentRow[]

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

        // Pick the first escalating incident as the target for an extra
        // synthetic "closed" notification — gives the seed a closed-event
        // card without needing a second incident or a real close transition.
        const closedDemoIncident = orgIncidents.find((i) => i.kind === "issue.escalating")

        const rows: (typeof notifications.$inferInsert)[] = []
        const now = new Date()

        for (const incident of orgIncidents) {
          const issueName = issueNameById.get(incident.sourceId)
          const basePayload = {
            event: "opened" as const,
            incidentKind: incident.kind,
            ...(issueName !== undefined ? { issueId: incident.sourceId, issueName } : {}),
            ...(projectSlug !== undefined ? { projectId: incident.projectId, projectSlug } : {}),
          }

          for (const member of orgMembers) {
            rows.push({
              id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:opened`)),
              organizationId: incident.organizationId,
              userId: member.userId,
              type: "incident",
              sourceId: incident.id,
              payload: basePayload,
              createdAt: incident.startedAt,
              seenAt: null,
            })
          }

          if (closedDemoIncident && incident.id === closedDemoIncident.id) {
            const closedPayload = { ...basePayload, event: "closed" as const }
            for (const member of orgMembers) {
              rows.push({
                id: NotificationId(ctx.scope.cuid(`notification:${incident.id}:${member.userId}:closed`)),
                organizationId: incident.organizationId,
                userId: member.userId,
                type: "incident",
                sourceId: incident.id,
                payload: closedPayload,
                createdAt: now,
                seenAt: null,
              })
            }
          }
        }

        for (const row of rows) {
          // Match the runtime partial unique index: drop dupes silently so
          // re-running the seeder is idempotent.
          await ctx.db.insert(notifications).values(row).onConflictDoNothing()
        }

        const counts = {
          opened: rows.filter((r) => (r.payload as { event: string }).event === "opened").length,
          closed: rows.filter((r) => (r.payload as { event: string }).event === "closed").length,
        }
        console.log(
          `  -> notifications: ${rows.length} rows (${counts.opened} opened, ${counts.closed} closed) across ${orgMembers.length} member(s)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed notifications", cause: error }),
    }).pipe(Effect.asVoid),
}

export const notificationSeeders: readonly Seeder[] = [seedIncidentNotifications]
