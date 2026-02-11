import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../constants'
import { Commit } from './models/types/Commit'
import { Dataset } from './models/types/Dataset'
import { DatasetRow } from './models/types/DatasetRow'
import { type DocumentVersion } from './models/types/DocumentVersion'
import { ExperimentDto } from './models/types/Experiment'
import { Optimization } from './models/types/Optimization'
import { type Session as BaseSession } from './models/types/Session'
import { type User } from './models/types/User'

export type Session = BaseSession & {
  user: User
}

export type Cursor<V = string, I = string> = { value: V; id: I }

export interface AverageResultAndCostOverCommit extends Commit {
  results: number
  averageResult: number
  averageCostInMillicents: number
}

export interface AverageResultOverTime {
  date: Date
  averageResult: number
  count: number
}

export type ResultWithEvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  result: EvaluationResultV2<T, M>
  evaluation: EvaluationV2<T, M>
}

export type EvaluationResultV2WithDetails<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationResultV2<T, M> & {
  commit: Commit
  dataset?: Dataset
  evaluatedRow?: DatasetRow
}

type EvaluationV2BaseStats = {
  totalResults: number
  averageScore: number
  totalCost: number
  totalTokens: number
}

export type EvaluationV2Stats = EvaluationV2BaseStats & {
  dailyOverview: (EvaluationV2BaseStats & {
    date: Date
  })[]
  versionOverview: (EvaluationV2BaseStats & {
    version: Commit
  })[]
}

export type OptimizationWithDetails = Optimization & {
  document?: DocumentVersion // Note: optional because it could have been deleted
  evaluation?: EvaluationV2 // Note: optional because it could have been deleted
  trainset?: Dataset
  testset?: Dataset
  baselineCommit?: Commit // Note: optional because it could have been deleted
  baselineExperiment?: ExperimentDto
  optimizedCommit?: Commit
  optimizedExperiment?: ExperimentDto
}
