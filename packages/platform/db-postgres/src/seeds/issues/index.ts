import { SEED_ISSUE_ID, SEED_ISSUE_UUID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared"
import { Effect } from "effect"
import { issues } from "../../schema/issues.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const issueRows = [
  {
    id: SEED_ISSUE_ID,
    uuid: SEED_ISSUE_UUID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Secret leakage in final answers",
    description:
      "The agent exposes private tokens, API keys, or other sensitive information in its final answer. " +
      "This pattern appears across different conversations where the agent is asked to interact with " +
      "external services or manage credentials on behalf of the user.",
    centroid: {
      base: new Array<number>(2048).fill(0),
      mass: 0,
      model: "voyage-4-large",
      decay: 14 * 24 * 60 * 60,
      weights: { annotation: 1.0, evaluation: 0.8, custom: 0.8 },
    },
    clusteredAt: new Date("2026-03-23T14:15:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-23T14:15:00.000Z"),
    updatedAt: new Date("2026-03-23T14:15:00.000Z"),
  },
] as const

const seedIssues: Seeder = {
  name: "issues/canonical-lifecycle-samples",
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

        console.log(`  -> issues: ${issueRows.length} canonical lifecycle samples`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
