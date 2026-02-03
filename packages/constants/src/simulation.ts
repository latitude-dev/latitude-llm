import { z } from 'zod'

export const MAX_SIMULATION_TURNS = 10

export const globalGoalSourceSchema = z.object({
  type: z.literal('global'),
  value: z.string(),
})

export const columnGoalSourceSchema = z.object({
  type: z.literal('column'),
  columnIndex: z.number(),
})

export const simulatedUserGoalSourceSchema = z.discriminatedUnion('type', [
  globalGoalSourceSchema,
  columnGoalSourceSchema,
])

export type SimulatedUserGoalSource = z.infer<
  typeof simulatedUserGoalSourceSchema
>

export const SimulationSettingsSchema = z.object({
  simulateToolResponses: z.boolean().optional(),
  simulatedTools: z.array(z.string()).optional(), // Empty array means all tools are simulated (if simulateToolResponses is true).
  toolSimulationInstructions: z.string().optional(), // A prompt used to guide and generate the simulation result
  maxTurns: z.number().min(1).max(MAX_SIMULATION_TURNS).optional(), // The maximum number of turns to simulate. Default is 1, and any greater value will add a new user message to the simulated conversation.
  simulatedUserGoal: z.string().optional(), // Deprecated: Use simulatedUserGoalSource instead. Kept for backward compatibility.
  simulatedUserGoalSource: simulatedUserGoalSourceSchema.optional(), // The source for the simulated user goal (global text or dataset column).
})

export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>
