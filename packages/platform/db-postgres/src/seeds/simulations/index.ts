import { SimulationId } from "@domain/shared"
import { COMBINATION_DATASET_ROWS, type SeedScope, WARRANTY_DATASET_ROWS } from "@domain/shared/seeding"
import { SIMULATION_DATASET_CUSTOM_SENTINEL, SIMULATION_THRESHOLD_CUSTOM_SENTINEL } from "@domain/simulations"
import { Effect } from "effect"
import { simulations } from "../../schema/simulations.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

type SimulationRow = typeof simulations.$inferInsert

/**
 * The simulation row carries an `evaluations: [...]` snapshot — a list
 * of evaluation ids the simulation ran against. Both sides resolve
 * through the same `scope` keys so the cross-reference works
 * automatically without threading return values from the evaluations
 * seeder forward (the demo project's `evaluation:warranty-active`
 * resolves to the same fresh id on both sides of the link).
 */
const buildSimulationRows = (scope: SeedScope) => {
  const simulationDate = (daysAgo: number, hour: number, minute = 0): Date => scope.dateDaysAgo(daysAgo, hour, minute)
  return [
    {
      id: SimulationId(scope.cuid("simulation:warranty")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      name: "Acme Assist Warranty Regression",
      dataset: scope.cuid("dataset:warranty"),
      evaluations: [scope.cuid("evaluation:warranty-active"), scope.cuid("evaluation:warranty-archived")],
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
      id: SimulationId(scope.cuid("simulation:combination")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      name: "Acme Assist Combination Safety Regression",
      dataset: scope.cuid("dataset:combination"),
      evaluations: [scope.cuid("evaluation:combination")],
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
      id: SimulationId(scope.cuid("simulation:errored")),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      name: "Acme Assist Logistics Loader Smoke Test",
      dataset: SIMULATION_DATASET_CUSTOM_SENTINEL,
      evaluations: [scope.cuid("evaluation:combination")],
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
}

const seedSimulations: Seeder = {
  name: "simulations/acme-support-runs",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const simulationRows = buildSimulationRows(ctx.scope)
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
