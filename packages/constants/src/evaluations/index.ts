import { z } from 'zod'
import {
  HumanEvaluationConfiguration,
  HumanEvaluationMetric,
  HumanEvaluationResultMetadata,
  HumanEvaluationSpecification,
} from './human'
import {
  LlmEvaluationConfiguration,
  LlmEvaluationMetric,
  LlmEvaluationResultMetadata,
  LlmEvaluationSpecification,
} from './llm'
import {
  RuleEvaluationConfiguration,
  RuleEvaluationMetric,
  RuleEvaluationResultMetadata,
  RuleEvaluationSpecification,
} from './rule'
export * from './human'
export * from './llm'
export * from './rule'

export enum EvaluationType {
  Rule = 'rule',
  Llm = 'llm',
  Human = 'human',
}

export const EvaluationTypeSchema = z.nativeEnum(EvaluationType)

// prettier-ignore
export type EvaluationMetric<T extends EvaluationType = EvaluationType> =
  T extends EvaluationType.Rule ? RuleEvaluationMetric :
  T extends EvaluationType.Llm ? LlmEvaluationMetric :
  T extends EvaluationType.Human ? HumanEvaluationMetric :
  never;

export const EvaluationMetricSchema = z.union([
  z.nativeEnum(RuleEvaluationMetric),
  z.nativeEnum(LlmEvaluationMetric),
  z.nativeEnum(HumanEvaluationMetric),
])

// prettier-ignore
export type EvaluationConfiguration<M extends EvaluationMetric = EvaluationMetric> =
  M extends RuleEvaluationMetric ? RuleEvaluationConfiguration<M> :
  M extends LlmEvaluationMetric ? LlmEvaluationConfiguration<M> :
  M extends HumanEvaluationMetric ? HumanEvaluationConfiguration<M> :
  never;

export const EvaluationConfigurationSchema = z.custom<EvaluationConfiguration>()

export enum EvaluationCondition {
  Less = 'less',
  LessEqual = 'less_equal',
  Equal = 'equal',
  NotEqual = 'not_equal',
  Greater = 'greater',
  GreaterEqual = 'greater_equal',
}

export const EvaluationConditionSchema = z.nativeEnum(EvaluationCondition)

// prettier-ignore
export type EvaluationResultMetadata<M extends EvaluationMetric = EvaluationMetric> =
  M extends RuleEvaluationMetric ? RuleEvaluationResultMetadata<M> :
  M extends LlmEvaluationMetric ? LlmEvaluationResultMetadata<M> :
  M extends HumanEvaluationMetric ? HumanEvaluationResultMetadata<M> :
  never;

export type EvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  name: string
  description: string
  configuration: z.ZodSchema<EvaluationConfiguration<M>>
  resultMetadata: z.ZodSchema<EvaluationResultMetadata<M>>
  supportsLiveEvaluation: boolean
}

export type EvaluationSpecification<T extends EvaluationType = EvaluationType> =
  {
    name: string
    description: string
    metrics: { [M in EvaluationMetric<T>]: EvaluationMetricSpecification<T, M> }
  }

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}

export type EvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  uuid: string
  versionId: number
  workspaceId: number
  commitId: number
  documentUuid: string
  name: string
  description: string
  type: T
  metric: M
  condition: EvaluationCondition
  threshold: number
  configuration: EvaluationConfiguration<M>
  live: boolean | null
  enableSuggestions: boolean | null
  autoApplySuggestions: boolean | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export type EvaluationResultV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  id: number
  uuid: string
  workspaceId: number
  commitId: number
  evaluationUuid: string
  experimentId: number | null
  evaluatedLogId: number
  score: number
  metadata: EvaluationResultMetadata<M>
  usedForSuggestion: boolean | null
  createdAt: Date
  updatedAt: Date
}

export type EvaluationSettings<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = Pick<
  EvaluationV2<T, M>,
  | 'name'
  | 'description'
  | 'type'
  | 'metric'
  | 'condition'
  | 'threshold'
  | 'configuration'
>

export const EvaluationSettingsSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: EvaluationTypeSchema,
  metric: EvaluationMetricSchema,
  condition: EvaluationConditionSchema,
  threshold: z.number(),
  configuration: EvaluationConfigurationSchema,
})

export type EvaluationOptions = Pick<
  EvaluationV2,
  'live' | 'enableSuggestions' | 'autoApplySuggestions'
>

export const EvaluationOptionsSchema = z.object({
  live: z.boolean().nullable(),
  enableSuggestions: z.boolean().nullable(),
  autoApplySuggestions: z.boolean().nullable(),
})

export const EVALUATION_SCORE_SCALE = 100

export const DEFAULT_DATASET_LABEL = 'expected_output'

// PROVISIONAL until migration to v2
export enum DatasetVersion {
  V1 = 'v1',
  V2 = 'v2',
}
