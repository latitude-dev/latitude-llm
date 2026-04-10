import { SEED_ISSUE_FIXTURES, SEED_ORG_ID, SEED_PROJECT_ID, seedDateDaysAgo } from "@domain/shared/seeding"
import { Effect } from "effect"
import { issues } from "../../schema/issues.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const baseCentroid = {
  base: new Array<number>(2048).fill(0),
  mass: 0,
  model: "voyage-4-large",
  decay: 14 * 24 * 60 * 60,
  weights: { annotation: 1.0, evaluation: 0.8, custom: 0.8 },
} as const

const issueRows = SEED_ISSUE_FIXTURES.map((issue) => ({
  id: issue.id,
  uuid: issue.uuid,
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  name: issue.name,
  description: issue.description,
  centroid: baseCentroid,
  clusteredAt: seedDateDaysAgo(issue.clusteredDaysAgo, 14, 15),
  escalatedAt: issue.escalatedDaysAgo === null ? null : seedDateDaysAgo(issue.escalatedDaysAgo, 9, 0),
  resolvedAt: issue.resolvedDaysAgo === null ? null : seedDateDaysAgo(issue.resolvedDaysAgo, 11, 30),
  ignoredAt: issue.ignoredDaysAgo === null ? null : seedDateDaysAgo(issue.ignoredDaysAgo, 13, 10),
  createdAt: seedDateDaysAgo(issue.createdDaysAgo, 14, 15),
  updatedAt: seedDateDaysAgo(issue.updatedDaysAgo, 16, 30),
})) as const

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const row of issueRows) {
          const { id, ...set } = row
          await ctx.db.insert(issues).values(row).onConflictDoUpdate({
            target: issues.id,
            set,
          })
        }

        console.log(`  -> issues: ${issueRows.length} Acme support issue families`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
