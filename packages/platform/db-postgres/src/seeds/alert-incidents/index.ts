import { type AlertIncidentKind, SEVERITY_FOR_KIND } from "@domain/alerts"
import { AlertIncidentId } from "@domain/shared"
import { SEED_ISSUE_FIXTURES } from "@domain/shared/seeding"
import { Effect } from "effect"
import { alertIncidents } from "../../schema/alert-incidents.ts"
import { fixtureScopedId, fixtureScopedKey, issueFixtureDates } from "../issues/index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const buildIncidentRow = (input: {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly sourceId: string
  readonly kind: AlertIncidentKind
  readonly startedAt: Date
  readonly endedAt: Date | null
}): typeof alertIncidents.$inferInsert => ({
  id: AlertIncidentId(input.id),
  organizationId: input.organizationId,
  projectId: input.projectId,
  sourceType: "issue",
  sourceId: input.sourceId,
  kind: input.kind,
  severity: SEVERITY_FOR_KIND[input.kind],
  startedAt: input.startedAt,
  endedAt: input.endedAt,
})

const seedAlertIncidents: Seeder = {
  name: "alert-incidents/issue-history",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const rows: (typeof alertIncidents.$inferInsert)[] = []

        for (const [index, fixture] of SEED_ISSUE_FIXTURES.entries()) {
          const issueKey = fixtureScopedKey(index)
          const issueId = fixtureScopedId(index, ctx.scope)
          const fixtureDates = issueFixtureDates(ctx.scope, fixture)

          // One issue.new incident per seeded issue — mirrors what the
          // production `IssueCreated` event would have produced when the
          // issue was first discovered. Gives the demo a non-empty
          // incident timeline out of the box.
          rows.push(
            buildIncidentRow({
              id: ctx.scope.cuid(`alert-incident:${issueKey}:issue.new`),
              organizationId: ctx.scope.organizationId,
              projectId: ctx.scope.projectId,
              sourceId: issueId,
              kind: "issue.new",
              startedAt: fixtureDates.createdAt,
              endedAt: null,
            }),
          )

          // Open `issue.escalating` row for fixtures the seed wants to
          // present as Escalating. `ended_at = null` is what the new
          // derive helper reads via `IssueRepository`'s JOIN to surface
          // the badge.
          if (fixture.escalatedDaysAgo !== null && fixtureDates.escalatedAt !== null) {
            rows.push(
              buildIncidentRow({
                id: ctx.scope.cuid(`alert-incident:${issueKey}:issue.escalating`),
                organizationId: ctx.scope.organizationId,
                projectId: ctx.scope.projectId,
                sourceId: issueId,
                kind: "issue.escalating",
                startedAt: fixtureDates.escalatedAt,
                endedAt: null,
              }),
            )
          }
        }

        for (const row of rows) {
          const { id, ...set } = row
          await ctx.db.insert(alertIncidents).values(row).onConflictDoUpdate({
            target: alertIncidents.id,
            set,
          })
        }

        const escalatingCount = rows.filter((row) => row.kind === "issue.escalating").length
        const newCount = rows.filter((row) => row.kind === "issue.new").length
        console.log(
          `  -> alert_incidents: ${rows.length} rows (${newCount} issue.new, ${escalatingCount} open issue.escalating)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed alert_incidents", cause: error }),
    }).pipe(Effect.asVoid),
}

export const alertIncidentSeeders: readonly Seeder[] = [seedAlertIncidents]
