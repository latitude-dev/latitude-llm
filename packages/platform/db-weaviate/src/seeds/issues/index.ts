import { CENTROID_EMBEDDING_DIMENSIONS } from "@domain/issues"
import {
  SEED_COMBINATION_ISSUE_UUID,
  SEED_GENERATE_ISSUE_UUID,
  SEED_ISSUE_UUID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { getCollectionForTenant, issuesCollectionTenantName, WeaviateCollection } from "../../collections.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const TENANT_NAME = issuesCollectionTenantName({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
})

const randomUnitVector = (dims: number): number[] => {
  const vec = Array.from({ length: dims }, () => Math.random() - 0.5)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map((v) => v / norm)
}

const issueDocuments = [
  {
    id: SEED_ISSUE_UUID,
    properties: {
      title: "Agent promises warranty coverage for excluded incidents",
      description:
        "The support agent tells customers that misuse incidents are covered by warranty when Acme policy " +
        "explicitly excludes cliffs, mesas, rooftop use, canyon anchoring, and other unsupported terrain or " +
        "installation conditions. The model may invent loyalty waivers, promise reimbursement before review, " +
        "or reframe misuse as a covered manufacturing defect.",
    },
  },
  {
    id: SEED_COMBINATION_ISSUE_UUID,
    properties: {
      title: "Agent recommends dangerous product combinations",
      description:
        "The support agent suggests combining Acme products in ways that compound danger, such as pairing " +
        "propulsion products, spatial distortion tools, weather controls, or seismic products. The model often " +
        "ignores documented incident history, invents authorization exceptions, or treats uncertified bundles as safe.",
    },
  },
  {
    id: SEED_GENERATE_ISSUE_UUID,
    properties: {
      title: "Agent invents unsupported logistics guarantees",
      description:
        "The support agent fabricates shipping promises, fee waivers, warehouse pickup options, or specialty " +
        "delivery services that Acme does not actually provide. The behavior is especially risky around cliffside " +
        "destinations, hazardous goods, and interplanetary shipping requests where the model turns review-only paths " +
        "into guaranteed service commitments.",
    },
  },
] as const

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const collection = await getCollectionForTenant(
          {
            tenantName: TENANT_NAME,
            collectionName: WeaviateCollection.Issues,
          },
          ctx.client,
        )

        for (const document of issueDocuments) {
          const data = {
            id: document.id,
            properties: document.properties,
            vectors: randomUnitVector(CENTROID_EMBEDDING_DIMENSIONS),
          }

          const exists = await collection.data.exists(document.id)

          if (exists) {
            await collection.data.replace(data)
          } else {
            await collection.data.insert(data)
          }
        }

        console.log(`    tenant: ${TENANT_NAME}`)
        console.log(`    issues: ${issueDocuments.length}`)
        console.log(`    vector: ${CENTROID_EMBEDDING_DIMENSIONS} dims (random unit vector)`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
