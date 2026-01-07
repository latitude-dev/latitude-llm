import { z } from 'zod'

export const SimulationSettingsSchema = z.object({
  simulateToolResponses: z.boolean().optional(),
  simulatedTools: z.array(z.string()).optional(), // Empty array means all tools are simulated (if simulateToolResponses is true).
  toolSimulationInstructions: z.string().optional(), // A prompt used to guide and generate the simulation result
})

export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>
