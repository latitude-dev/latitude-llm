export type SimulationSettings = {
  simulateToolResponses?: boolean
  simulatedTools?: string[] // Empty array means all tools are simulated (if simulateToolResponses is true).
  toolSimulationInstructions?: string // A prompt used to guide and generate the simulation result
}
