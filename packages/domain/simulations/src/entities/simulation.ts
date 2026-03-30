import { cuidSchema, SimulationId } from "@domain/shared"
import { z } from "zod"
import {
  SIMULATION_DATASET_CUSTOM_SENTINEL,
  SIMULATION_EVALUATIONS_MAX_LENGTH,
  SIMULATION_NAME_MAX_LENGTH,
  SIMULATION_THRESHOLD_CUSTOM_SENTINEL,
} from "../constants.ts"

// ---------------------------------------------------------------------------
// SimulationId schema
// ---------------------------------------------------------------------------

export const simulationIdSchema = cuidSchema.transform(SimulationId)

// ---------------------------------------------------------------------------
// SimulationMetadata
// ---------------------------------------------------------------------------

export const simulationMetadataSchema = z.object({
  threshold: z.union([
    z.number().min(0).max(100), // percentage [0, 100]
    z.literal(SIMULATION_THRESHOLD_CUSTOM_SENTINEL), // "CUSTOM" when the user provides a custom threshold function
  ]),
  scenarios: z.number().int().nonnegative(), // number of dataset rows/scenarios executed by the run
  file: z.string().min(1), // simulation entrypoint filename that was used to run the simulation
  sdk: z.string().min(1), // language and version of the sdk that was used to run the simulation e.g. "javascript@1.2.3"
})

export type SimulationMetadata = z.infer<typeof simulationMetadataSchema>

// ---------------------------------------------------------------------------
// Simulation entity
// ---------------------------------------------------------------------------

export const simulationSchema = z
  .object({
    id: simulationIdSchema, // CUID simulation identifier
    organizationId: cuidSchema, // owning organization
    projectId: cuidSchema, // owning project
    name: z.string().min(1).max(SIMULATION_NAME_MAX_LENGTH), // simulation name (defined in the `*.sim.*` file)
    dataset: z.union([cuidSchema, z.literal(SIMULATION_DATASET_CUSTOM_SENTINEL)]), // dataset CUID or "CUSTOM" sentinel; query-backed datasets are deferred to post-MVP
    evaluations: z.array(z.string().min(1).max(SIMULATION_EVALUATIONS_MAX_LENGTH)), // evaluation cuids or custom source ids used during the run
    passed: z.boolean(), // true if the full simulation run passed
    errored: z.boolean(), // derived helper maintained by application code at write time from whether `error` is present
    metadata: simulationMetadataSchema, // structured simulation run metadata
    error: z.string().min(1).nullable(), // canonical error text when the simulation failed to run
    startedAt: z.date(), // simulation start timestamp
    finishedAt: z.date(), // simulation finish timestamp
    createdAt: z.date(), // simulation creation time
    updatedAt: z.date(), // simulation update time
  })
  .superRefine((simulation, ctx) => {
    const hasError = simulation.error !== null

    if (simulation.errored !== hasError) {
      ctx.addIssue({
        code: "custom",
        message: "errored must match whether error is present",
        path: ["errored"],
        input: simulation.errored,
      })
    }

    if (simulation.passed && hasError) {
      ctx.addIssue({
        code: "custom",
        message: "passed simulations cannot include an error",
        path: ["passed"],
        input: simulation.passed,
      })
    }

    if (simulation.startedAt > simulation.finishedAt) {
      ctx.addIssue({
        code: "custom",
        message: "startedAt must not be after finishedAt",
        path: ["finishedAt"],
        input: simulation.finishedAt,
      })
    }
  })

export type Simulation = z.infer<typeof simulationSchema>

/** @knipignore - TODO: unignore once used */
export { SIMULATION_DATASET_CUSTOM_SENTINEL }
