import { SimulationSettings } from './simulation'
import { z } from 'zod'

export const experimentVariantSchema = z.object({
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
})

export type ExperimentVariant = z.infer<typeof experimentVariantSchema>

// Experiment ran from a dataset
const experimentDatasetSourceSchema = z.object({
  source: z.literal('dataset'),
  datasetId: z.number(),
  fromRow: z.number(),
  toRow: z.number(),
  datasetLabels: z.record(z.string(), z.string()),
  parametersMap: z.record(z.string(), z.number()),
})

export type ExperimentDatasetSource = z.infer<
  typeof experimentDatasetSourceSchema
>

// Experiment ran from last logs (from commit and creation time of experiment)
const experimentLogsSourceSchema = z.object({
  source: z.literal('logs'),
  count: z.number(),
})

export type ExperimentLogsSource = z.infer<typeof experimentLogsSourceSchema>

// Experiment ran with manual parameters (currently only used for prompts with no parameters)
const experimentManualSourceSchema = z.object({
  source: z.literal('manual'),
  count: z.number(),
  parametersMap: z.record(z.string(), z.number()),
})

export type ExperimentManualSource = z.infer<
  typeof experimentManualSourceSchema
>

export const experimentParametersSourceSchema = z.discriminatedUnion('source', [
  experimentDatasetSourceSchema,
  experimentLogsSourceSchema,
  experimentManualSourceSchema,
])

export type ExperimentParametersSource = z.infer<
  typeof experimentParametersSourceSchema
>

export type ExperimentMetadata = {
  prompt: string
  promptHash: string
  count: number // Total number of to generate logs in the experiment
  parametersSource: ExperimentParametersSource
  simulationSettings?: SimulationSettings
}

export type ExperimentScores = {
  [evaluationUuid: string]: {
    count: number
    totalScore: number
    totalNormalizedScore: number
  }
}
