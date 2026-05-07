import { type AlertIncidentKind, SEVERITY_FOR_KIND } from "@domain/alerts"
import { ESCALATION_MIN_OCCURRENCES_THRESHOLD, ESCALATION_THRESHOLD_FACTOR } from "@domain/issues"
import { AlertIncidentId } from "@domain/shared"
import { SEED_ISSUE_FIXTURES, SEED_REGRESSED_ISSUE_IDS } from "@domain/shared/seeding"
import { sql } from "drizzle-orm"
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

interface IssueOccurrenceStats {
  readonly issueId: string
  readonly recentCount: number
  readonly baselineAvgPerDay: number
}

/**
 * Compute per-issue recent / baseline occurrence counts directly from the
 * seeded `scores` table. Mirrors what the production
 * `ScoreAnalyticsRepository.aggregateByIssues` query does (recent = last
 * 24h, baseline = avg/day across days 1–8 ago) so escalation labels are
 * derived from the same data shape the runtime threshold check sees.
 */
const fetchIssueOccurrenceStats = async (
  ctx: SeedContext,
  organizationId: string,
  projectId: string,
): Promise<readonly IssueOccurrenceStats[]> => {
  const rows = await ctx.db.execute<{
    issue_id: string
    recent_count: number
    baseline_avg_per_day: number
  }>(sql`
    select
      issue_id,
      count(*) filter (
        where created_at >= now() - interval '1 day'
      )::int as recent_count,
      (count(*) filter (
        where created_at >= now() - interval '8 days'
          and created_at <  now() - interval '1 day'
      )::float / 7) as baseline_avg_per_day
    from latitude.scores
    where organization_id = ${organizationId}
      and project_id = ${projectId}
      and issue_id is not null
      and drafted_at is null
    group by issue_id
  `)

  // Drizzle's execute returns the result wrapped depending on driver — use
  // the array shape directly for node-postgres / pg-pool.
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows
  const safe = (list ?? []) as readonly {
    issue_id: string
    recent_count: number
    baseline_avg_per_day: number
  }[]

  return safe.map((row) => ({
    issueId: row.issue_id,
    recentCount: Number(row.recent_count),
    baselineAvgPerDay: Number(row.baseline_avg_per_day),
  }))
}

const escalationEntryThreshold = (baselineAvgPerDay: number): number =>
  Math.max(
    ESCALATION_MIN_OCCURRENCES_THRESHOLD,
    Math.floor(Math.max(0, baselineAvgPerDay) * ESCALATION_THRESHOLD_FACTOR) + 1,
  )

const seedAlertIncidents: Seeder = {
  name: "alert-incidents/issue-history",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const rows: (typeof alertIncidents.$inferInsert)[] = []

        // 1. One `issue.new` row per seeded fixture — the historical record
        //    of when the issue was first discovered. Mirrors what the
        //    production `IssueCreated` event would have produced.
        const fixtureScopedIssueIds = new Map<string, string>()
        for (const [index, fixture] of SEED_ISSUE_FIXTURES.entries()) {
          const issueKey = fixtureScopedKey(index)
          const issueId = fixtureScopedId(index, ctx.scope)
          fixtureScopedIssueIds.set(fixture.id, issueId)
          const fixtureDates = issueFixtureDates(ctx.scope, fixture)

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
        }

        // 2. Open `issue.escalating` rows derived from the actual seeded
        //    score data. Issues whose recent (last 24h) occurrence count
        //    crosses the production entry threshold get an open incident.
        const stats = await fetchIssueOccurrenceStats(ctx, ctx.scope.organizationId, ctx.scope.projectId)
        const escalatingIssueIds = new Set<string>()
        for (const stat of stats) {
          const threshold = escalationEntryThreshold(stat.baselineAvgPerDay)
          if (stat.recentCount >= threshold) {
            escalatingIssueIds.add(stat.issueId)
          }
        }

        for (let index = 0; index < SEED_ISSUE_FIXTURES.length; index++) {
          const issueId = fixtureScopedId(index, ctx.scope)
          if (!escalatingIssueIds.has(issueId)) continue
          const issueKey = fixtureScopedKey(index)
          rows.push(
            buildIncidentRow({
              id: ctx.scope.cuid(`alert-incident:${issueKey}:issue.escalating`),
              organizationId: ctx.scope.organizationId,
              projectId: ctx.scope.projectId,
              sourceId: issueId,
              kind: "issue.escalating",
              startedAt: ctx.scope.dateDaysAgo(0, 6, 0),
              endedAt: null,
            }),
          )
        }

        // 3. Curated `issue.regressed` rows for the regression demo set.
        //    Issue ids designated by `SEED_REGRESSED_ISSUE_IDS` have their
        //    `resolvedAt` cleared by the issues seeder (mirroring what the
        //    production `assign-score-to-issue` regression detection does)
        //    so the read path derives them as Regressed.
        const regressionStartedAt = ctx.scope.dateDaysAgo(2, 9, 0)
        for (const fixtureIssueId of SEED_REGRESSED_ISSUE_IDS) {
          const scopedIssueId = fixtureScopedIssueIds.get(fixtureIssueId)
          if (!scopedIssueId) continue
          const fixtureIndex = SEED_ISSUE_FIXTURES.findIndex((fixture) => fixture.id === fixtureIssueId)
          const issueKey = fixtureIndex === -1 ? fixtureIssueId : fixtureScopedKey(fixtureIndex)
          rows.push(
            buildIncidentRow({
              id: ctx.scope.cuid(`alert-incident:${issueKey}:issue.regressed`),
              organizationId: ctx.scope.organizationId,
              projectId: ctx.scope.projectId,
              sourceId: scopedIssueId,
              kind: "issue.regressed",
              startedAt: regressionStartedAt,
              endedAt: null,
            }),
          )
        }

        for (const row of rows) {
          const { id, ...set } = row
          await ctx.db.insert(alertIncidents).values(row).onConflictDoUpdate({
            target: alertIncidents.id,
            set,
          })
        }

        const counts = {
          new: rows.filter((row) => row.kind === "issue.new").length,
          escalating: rows.filter((row) => row.kind === "issue.escalating").length,
          regressed: rows.filter((row) => row.kind === "issue.regressed").length,
        }
        console.log(
          `  -> alert_incidents: ${rows.length} rows (${counts.new} issue.new, ${counts.escalating} open issue.escalating from real occurrence data, ${counts.regressed} issue.regressed)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed alert_incidents", cause: error }),
    }).pipe(Effect.asVoid),
}

export const alertIncidentSeeders: readonly Seeder[] = [seedAlertIncidents]
