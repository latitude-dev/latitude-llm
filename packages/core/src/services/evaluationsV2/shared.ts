import type { Message } from '@latitude-data/constants/legacyCompiler'
import { Database } from '../../client'
import {
  DocumentLog,
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
} from '../../constants'
import { TypedResult } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../schema/models/types/Workspace'
import { ProviderLogDto } from '../../schema/types'

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
  actualOutput: TypedResult<string>
  expectedOutput?: TypedResult<string>
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
  actualOutput: TypedResult<string>
  conversation: Message[]
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
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>>>
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
  ) => Promise<TypedResult<EvaluationSettings>>
}

export type EvaluationBackendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  validate: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: EvaluationMetricValidateArgs<T, M> & { metric: M },
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>>>
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
  ) => Promise<TypedResult<EvaluationSettings>>
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
