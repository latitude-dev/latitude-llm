import {
  SEED_COMBINATION_ISSUE_ID,
  SEED_COMBINATION_ISSUE_UUID,
  SEED_GENERATE_ISSUE_ID,
  SEED_GENERATE_ISSUE_UUID,
  SEED_ISSUE_ID,
  SEED_ISSUE_UUID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
} from "@domain/shared/seeding"
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

const issueRows = [
  {
    id: SEED_ISSUE_ID,
    uuid: SEED_ISSUE_UUID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Agent promises warranty coverage for excluded incidents",
    description:
      "The support agent tells customers that misuse incidents are covered by warranty when Acme policy " +
      "explicitly excludes cliffs, mesas, rooftop use, canyon anchoring, and other unsupported terrain or " +
      "installation conditions. The model may invent loyalty waivers, promise reimbursement before review, " +
      "or reframe misuse as a covered manufacturing defect.",
    centroid: baseCentroid,
    clusteredAt: new Date("2026-03-23T14:15:00.000Z"),
    escalatedAt: new Date("2026-03-24T09:00:00.000Z"),
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-23T14:15:00.000Z"),
    updatedAt: new Date("2026-03-27T16:30:00.000Z"),
  },
  {
    id: SEED_COMBINATION_ISSUE_ID,
    uuid: SEED_COMBINATION_ISSUE_UUID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Agent recommends dangerous product combinations",
    description:
      "The support agent suggests combining Acme products in ways that compound danger, such as pairing " +
      "propulsion products, spatial distortion tools, weather controls, or seismic products. The model often " +
      "ignores documented incident history, invents authorization exceptions, or treats uncertified bundles as safe.",
    centroid: baseCentroid,
    clusteredAt: new Date("2026-03-26T11:10:00.000Z"),
    escalatedAt: new Date("2026-03-27T10:20:00.000Z"),
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-26T11:10:00.000Z"),
    updatedAt: new Date("2026-03-28T12:45:00.000Z"),
  },
  {
    id: SEED_GENERATE_ISSUE_ID,
    uuid: SEED_GENERATE_ISSUE_UUID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Agent invents unsupported logistics guarantees",
    description:
      "The support agent fabricates shipping promises, fee waivers, warehouse pickup options, or specialty " +
      "delivery services that Acme does not actually provide. The behavior is especially risky around cliffside " +
      "destinations, hazardous goods, and interplanetary shipping requests where the model turns review-only paths " +
      "into guaranteed service commitments.",
    centroid: baseCentroid,
    clusteredAt: new Date("2026-03-29T08:35:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-03-29T08:35:00.000Z"),
    updatedAt: new Date("2026-03-29T08:35:00.000Z"),
  },
] as const

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
