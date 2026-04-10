import {
  COMBINATION_DATASET_ROWS,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_DATASET_ID,
  SEED_EVALUATION_ARCHIVED_ID,
  SEED_EVALUATION_ID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SIMULATION_ERRORED_ID,
  SEED_SIMULATION_ID,
  SEED_WARRANTY_DATASET_ID,
  SEED_WARRANTY_SIMULATION_ID,
  seedDateDaysAgo,
  WARRANTY_DATASET_ROWS,
} from "@domain/shared/seeding"
import { SIMULATION_DATASET_CUSTOM_SENTINEL, SIMULATION_THRESHOLD_CUSTOM_SENTINEL } from "@domain/simulations"
import { Effect } from "effect"
import { simulations } from "../../schema/simulations.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

type SimulationRow = typeof simulations.$inferInsert

function simulationDate(daysAgo: number, hour: number, minute = 0): Date {
  return seedDateDaysAgo(daysAgo, hour, minute)
}

const simulationRows = [
  {
    id: SEED_WARRANTY_SIMULATION_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Acme Assist Warranty Regression",
    dataset: SEED_WARRANTY_DATASET_ID,
    evaluations: [SEED_EVALUATION_ID, SEED_EVALUATION_ARCHIVED_ID],
    passed: true,
    errored: false,
    metadata: {
      threshold: 92,
      scenarios: WARRANTY_DATASET_ROWS.length,
      file: "warranty-guardrails.sim.ts",
      sdk: "javascript@1.0.0",
    },
    error: null,
    startedAt: simulationDate(6, 9, 0),
    finishedAt: simulationDate(6, 9, 6),
    createdAt: simulationDate(6, 9, 6),
    updatedAt: simulationDate(6, 9, 6),
  },
  {
    id: SEED_SIMULATION_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Acme Assist Combination Safety Regression",
    dataset: SEED_DATASET_ID,
    evaluations: [SEED_COMBINATION_EVALUATION_ID],
    passed: true,
    errored: false,
    metadata: {
      threshold: 95,
      scenarios: COMBINATION_DATASET_ROWS.length,
      file: "dangerous-combinations.sim.ts",
      sdk: "javascript@1.0.0",
    },
    error: null,
    startedAt: simulationDate(4, 13, 15),
    finishedAt: simulationDate(4, 13, 24),
    createdAt: simulationDate(4, 13, 24),
    updatedAt: simulationDate(4, 13, 24),
  },
  {
    id: SEED_SIMULATION_ERRORED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    name: "Acme Assist Logistics Loader Smoke Test",
    dataset: SIMULATION_DATASET_CUSTOM_SENTINEL,
    evaluations: [SEED_COMBINATION_EVALUATION_ID],
    passed: false,
    errored: true,
    metadata: {
      threshold: SIMULATION_THRESHOLD_CUSTOM_SENTINEL,
      scenarios: 6,
      file: "logistics-loader-smoke.sim.ts",
      sdk: "javascript@1.0.0",
    },
    error:
      "Custom dataset loader timed out while fetching mesa-delivery logistics scenarios from the Acme Logistics staging API.",
    startedAt: simulationDate(3, 7, 40),
    finishedAt: simulationDate(3, 7, 41),
    createdAt: simulationDate(3, 7, 41),
    updatedAt: simulationDate(3, 7, 41),
  },
] satisfies SimulationRow[]

const seedSimulations: Seeder = {
  name: "simulations/acme-support-runs",
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

        console.log(`  -> simulations: ${simulationRows.length} Acme support runs`)
      },
      catch: (error) => new SeedError({ reason: "Failed to seed simulations", cause: error }),
    }).pipe(Effect.asVoid),
}

export const simulationSeeders: readonly Seeder[] = [seedSimulations]
