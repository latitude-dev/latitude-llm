import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../constants'
import { type User } from './models/types/User'
import { type Session as BaseSession } from './models/types/Session'
import { Commit } from './models/types/Commit'
import { ProviderLog } from './models/types/ProviderLog'
import { Dataset } from './models/types/Dataset'
import { DatasetRow } from './models/types/DatasetRow'

export type Session = BaseSession & {
  user: User
}

export type Cursor<V = string, I = string> = { value: V; id: I }

export type ProviderLogDto = Omit<
  ProviderLog,
  'responseText' | 'responseObject'
> & { response: string }

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

export type EvaluationResultV2WithIssue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationResultV2<T, M> & { issueId: number | null }

export type ResultWithEvaluationV2AndIssue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = ResultWithEvaluationV2<T, M> & {
  result: EvaluationResultV2WithIssue<T, M>
}

export type EvaluationResultV2WithDetails<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationResultV2<T, M> & {
  commit: Commit
  dataset?: Dataset
  evaluatedRow?: DatasetRow
  evaluatedLog?: ProviderLogDto
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
