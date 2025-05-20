import type { Message } from '@latitude-data/compiler'
import {
  Commit,
  Dataset,
  DatasetRow,
  DocumentLog,
  DocumentVersion,
  EVALUATION_SCORE_SCALE,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationResultMetadata,
  EvaluationResultValue,
  EvaluationSettings,
  EvaluationSpecification,
  EvaluationType,
  EvaluationV2,
  ProviderApiKey,
  ProviderLogDto,
  Workspace,
} from '../../browser'
import { Database } from '../../client'
import { LatitudeError } from '../../lib/errors'
import { TypedResult } from '../../lib/Result'

export type EvaluationMetricValidateArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  mode: 'create' | 'update'
  configuration: EvaluationConfiguration<T, M>
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
}

export type EvaluationMetricRunArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  resultUuid: string
  evaluation: EvaluationV2<T, M>
  actualOutput: string
  expectedOutput?: string
  conversation: Message[]
  providerLog: ProviderLogDto
  documentLog: DocumentLog
  document: DocumentVersion
  dataset?: Dataset
  datasetLabel?: string
  datasetRow?: DatasetRow
  providers?: Map<string, ProviderApiKey>
  commit: Commit
  workspace: Workspace
}

export type EvaluationMetricAnnotateArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  resultUuid: string
  resultScore: number
  resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
  evaluation: EvaluationV2<T, M>
  actualOutput: string
  providerLog: ProviderLogDto
  documentLog: DocumentLog
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
}

export type EvaluationMetricCloneArgs<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  providers?: Map<string, ProviderApiKey>
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
  run?: (
    args: EvaluationMetricRunArgs<T, M>,
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
  annotate?: (
    args: EvaluationMetricAnnotateArgs<T, M>,
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
  clone?: (
    args: EvaluationMetricCloneArgs<T, M>,
    db?: Database,
  ) => Promise<TypedResult<EvaluationSettings, LatitudeError>>
}

export type EvaluationBackendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  validate: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: EvaluationMetricValidateArgs<T, M> & { metric: M },
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>, LatitudeError>>
  run?: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: EvaluationMetricRunArgs<T, M> & { metric: M },
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
  annotate?: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: EvaluationMetricAnnotateArgs<T, M> & { metric: M },
    db?: Database,
  ) => Promise<EvaluationResultValue<T, M>>
  clone?: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: EvaluationMetricCloneArgs<T, M> & { metric: M },
    db?: Database,
  ) => Promise<TypedResult<EvaluationSettings, LatitudeError>>
  metrics: {
    [M in EvaluationMetric<T>]: EvaluationMetricBackendSpecification<T, M>
  }
}

export function normalizeScore(score: number, lower: number, upper: number) {
  if (lower === upper) return score === lower ? EVALUATION_SCORE_SCALE : 0
  else if (lower < upper) score = Math.min(Math.max(score, lower), upper)
  else score = Math.min(Math.max(score, upper), lower)
  const range = Math.abs(upper - lower)
  const value = Math.abs(score - lower)
  const map = (value * EVALUATION_SCORE_SCALE) / range
  return Math.min(Math.max(Number(map.toFixed(0)), 0), EVALUATION_SCORE_SCALE)
}
