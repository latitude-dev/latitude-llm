import { type InferSelectModel } from 'drizzle-orm'

import { experiments } from '../experiments'
import { ExperimentScores } from '@latitude-data/constants'

export type ExperimentAggregatedResults = {
  passed: number
  failed: number
  errors: number
  totalScore: number
}

export type Experiment = InferSelectModel<typeof experiments>
export type ExperimentDto = Experiment & {
  results: ExperimentAggregatedResults
}

export type ExperimentLogsMetadata = {
  totalCost: number
  totalTokens: number
  totalDuration: number
  count: number
}
export type ExperimentWithScores = ExperimentDto & {
  scores: ExperimentScores
  logsMetadata: ExperimentLogsMetadata
}
