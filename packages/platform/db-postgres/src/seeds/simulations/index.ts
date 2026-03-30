import {
  SEED_DATASET_ID,
  SEED_EVALUATION_ID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SIMULATION_ERRORED_ID,
  SEED_SIMULATION_ID,
} from "@domain/shared"
import { Effect } from "effect"
import { simulations } from "../../schema/simulations.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const simulationRows = [
  {
    id: SEED_SIMULATION_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Support Agent",
    dataset: SEED_DATASET_ID as string,
    evaluations: [SEED_EVALUATION_ID as string, "custom-code-simple"],
    passed: true,
    errored: false,
    metadata: {
      threshold: 50,
      scenarios: 12,
      file: "supportAgent.sim.ts",
      sdk: "javascript@1.0.0",
    },
    error: null,
    startedAt: new Date("2026-03-25T14:00:00.000Z"),
    finishedAt: new Date("2026-03-25T14:05:30.000Z"),
    createdAt: new Date("2026-03-25T14:00:00.000Z"),
    updatedAt: new Date("2026-03-25T14:05:30.000Z"),
  },
  {
    id: SEED_SIMULATION_ERRORED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Billing Agent",
    dataset: "CUSTOM",
    evaluations: ["billing-accuracy"],
    passed: false,
    errored: true,
    metadata: {
      threshold: "CUSTOM" as const,
      scenarios: 5,
      file: "billingAgent.sim.ts",
      sdk: "javascript@1.0.0",
    },
    error: "Dataset loader function threw: connection refused to external data source",
    startedAt: new Date("2026-03-26T09:00:00.000Z"),
    finishedAt: new Date("2026-03-26T09:00:02.000Z"),
    createdAt: new Date("2026-03-26T09:00:00.000Z"),
    updatedAt: new Date("2026-03-26T09:00:02.000Z"),
  },
]

const seedSimulations: Seeder = {
  name: "simulations/canonical-lifecycle-samples",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const row of simulationRows) {
          const { id, ...set } = row
          await ctx.db.insert(simulations).values(row).onConflictDoUpdate({
            target: simulations.id,
            set,
          })
        }

        console.log(`  -> simulations: ${simulationRows.length} canonical lifecycle samples`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed simulations", cause: error }),
    }).pipe(Effect.asVoid),
}

export const simulationSeeders: readonly Seeder[] = [seedSimulations]
