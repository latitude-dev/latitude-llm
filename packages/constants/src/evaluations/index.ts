import { z } from 'zod'
import {
  HumanEvaluationConfiguration,
  HumanEvaluationMetric,
  HumanEvaluationResultError,
  HumanEvaluationResultMetadata,
  HumanEvaluationSpecification,
} from './human'
import {
  LlmEvaluationConfiguration,
  LlmEvaluationMetric,
  LlmEvaluationResultError,
  LlmEvaluationResultMetadata,
  LlmEvaluationSpecification,
} from './llm'
import {
  RuleEvaluationConfiguration,
  RuleEvaluationMetric,
  RuleEvaluationResultError,
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
export type EvaluationConfiguration<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> =
  T extends EvaluationType.Rule ? RuleEvaluationConfiguration<M extends RuleEvaluationMetric ? M : never> :
  T extends EvaluationType.Llm ? LlmEvaluationConfiguration<M extends LlmEvaluationMetric ? M : never> :
  T extends EvaluationType.Human ? HumanEvaluationConfiguration<M extends HumanEvaluationMetric ? M : never> :
  never;

export const EvaluationConfigurationSchema = z.custom<EvaluationConfiguration>()

// prettier-ignore
export type EvaluationResultMetadata<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> =
  T extends EvaluationType.Rule ? RuleEvaluationResultMetadata<M extends RuleEvaluationMetric ? M : never> :
  T extends EvaluationType.Llm ? LlmEvaluationResultMetadata<M extends LlmEvaluationMetric ? M : never> :
  T extends EvaluationType.Human ? HumanEvaluationResultMetadata<M extends HumanEvaluationMetric ? M : never> :
  never;

// prettier-ignore
export const EvaluationResultMetadataSchema = z.custom<EvaluationResultMetadata>()

// prettier-ignore
export type EvaluationResultError<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> =
  T extends EvaluationType.Rule ? RuleEvaluationResultError<M extends RuleEvaluationMetric ? M : never> :
  T extends EvaluationType.Llm ? LlmEvaluationResultError<M extends LlmEvaluationMetric ? M : never> :
  T extends EvaluationType.Human ? HumanEvaluationResultError<M extends HumanEvaluationMetric ? M : never> :
  never;

// prettier-ignore
export const EvaluationResultErrorSchema = z.custom<EvaluationResultError>()

export type EvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  name: string
  description: string
  configuration: z.ZodSchema<EvaluationConfiguration<T, M>>
  resultMetadata: z.ZodSchema<EvaluationResultMetadata<T, M>>
  resultError: z.ZodSchema<EvaluationResultError<T, M>>
  requiresExpectedOutput: boolean
  requiresAnnotation: boolean
  supportsLiveEvaluation: boolean
  supportsBatchEvaluation: boolean
}

export type EvaluationSpecification<T extends EvaluationType = EvaluationType> =
  {
    name: string
    description: string
    configuration: z.ZodSchema
    resultMetadata: z.ZodSchema
    resultError: z.ZodSchema
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
  configuration: EvaluationConfiguration<T, M>
  evaluateLiveLogs?: boolean | null
  enableSuggestions?: boolean | null
  autoApplySuggestions?: boolean | null
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
}

export type EvaluationResultValue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> =
  | {
      score: number
      normalizedScore: number
      metadata: EvaluationResultMetadata<T, M>
      hasPassed: boolean
      error?: null
    }
  | {
      score?: null
      normalizedScore?: null
      metadata?: null
      hasPassed?: null
      error: EvaluationResultError<T, M>
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
  experimentId?: number | null
  datasetId?: number | null
  evaluatedRowId?: number | null
  evaluatedLogId: number
  usedForSuggestion?: boolean | null
  createdAt: Date
  updatedAt: Date
} & EvaluationResultValue<T, M>

export type EvaluationSettings<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = Pick<
  EvaluationV2<T, M>,
  'name' | 'description' | 'type' | 'metric' | 'configuration'
>

export const EvaluationSettingsSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: EvaluationTypeSchema,
  metric: EvaluationMetricSchema,
  configuration: EvaluationConfigurationSchema,
})

export type EvaluationOptions = Pick<
  EvaluationV2,
  'evaluateLiveLogs' | 'enableSuggestions' | 'autoApplySuggestions'
>

export const EvaluationOptionsSchema = z.object({
  evaluateLiveLogs: z.boolean().nullable().optional(),
  enableSuggestions: z.boolean().nullable().optional(),
  autoApplySuggestions: z.boolean().nullable().optional(),
})

export const EVALUATION_SCORE_SCALE = 100

export const DEFAULT_DATASET_LABEL = 'output'
