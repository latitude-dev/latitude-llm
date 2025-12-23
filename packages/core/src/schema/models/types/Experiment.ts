import { type InferSelectModel } from 'drizzle-orm'

import { ExperimentScores } from '@latitude-data/constants'
import { TrackedProgress } from '../../../jobs/utils/progressTracker'
import { experiments } from '../experiments'

export type ExperimentAggregatedResults = {
  passed: number
  failed: number
  errors: number
  totalScore: number
}

export type Experiment = InferSelectModel<typeof experiments>
// TODO(AO/OPT): Implement and use in frontend
export type ExperimentDto = Experiment & {
  results: TrackedProgress
  optimizationUuid?: string
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
