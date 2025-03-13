import type { Message } from '@latitude-data/compiler'
import {
  Commit,
  DatasetRow,
  DatasetV2,
  DocumentLog,
  DocumentVersion,
  EVALUATION_SCORE_SCALE,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationResultValue,
  EvaluationSpecification,
  EvaluationType,
  EvaluationV2,
  ProviderLog,
  Workspace,
} from '../../browser'
import { Database } from '../../client'
import { LatitudeError, TypedResult } from '../../lib'
import HumanEvaluationSpecification from './human'
import LlmEvaluationSpecification from './llm'
import RuleEvaluationSpecification from './rule'

export type EvaluationMetricValidateArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  configuration: EvaluationConfiguration<T, M>
}

export type EvaluationMetricRunArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  conversation: Message[]
  dataset?: DatasetV2
  row?: DatasetRow
  providerLog: ProviderLog
  documentLog: DocumentLog
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
}

export type EvaluationMetricBackendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationMetricSpecification<T, M> & {
  validate: (
    args: EvaluationMetricValidateArgs<T, M>,
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>, LatitudeError>>
  run: (
    args: EvaluationMetricRunArgs<T, M>,
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
}

export type EvaluationBackendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  validate: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: { metric: M } & EvaluationMetricValidateArgs<T, M>,
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>, LatitudeError>>
  run: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: { metric: M } & EvaluationMetricRunArgs<T, M>,
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
  metrics: {
    [M in EvaluationMetric<T>]: EvaluationMetricBackendSpecification<T, M>
  }
}

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationBackendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}

export function normalizeScore(score: number, lower: number, upper: number) {
  const range = Math.abs(upper - lower)
  const value = Math.abs(score - lower)
  const map = (value * EVALUATION_SCORE_SCALE) / range
  return Math.min(Math.max(0, map), EVALUATION_SCORE_SCALE)
}
