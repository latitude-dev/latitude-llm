import { z } from 'zod'
import {
  CompositeEvaluationConfiguration,
  CompositeEvaluationMetric,
  CompositeEvaluationResultError,
  CompositeEvaluationResultMetadata,
  CompositeEvaluationSpecification,
} from './composite'
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

export * from './composite'
export * from './human'
export * from './llm'
export * from './rule'
export * from './shared'
export * from './active'

export enum EvaluationType {
  Rule = 'rule',
  Llm = 'llm',
  Human = 'human',
  Composite = 'composite',
}

export const EvaluationTypeSchema = z.enum(EvaluationType)

// prettier-ignore
export type EvaluationMetric<T extends EvaluationType = EvaluationType> =
  T extends EvaluationType.Rule ? RuleEvaluationMetric :
  T extends EvaluationType.Llm ? LlmEvaluationMetric :
  T extends EvaluationType.Human ? HumanEvaluationMetric :
  T extends EvaluationType.Composite ? CompositeEvaluationMetric :
  never;

export const EvaluationMetricSchema = z.union([
  z.enum(RuleEvaluationMetric),
  z.enum(LlmEvaluationMetric),
  z.enum(HumanEvaluationMetric),
  z.enum(CompositeEvaluationMetric),
])

// prettier-ignore
export type EvaluationConfiguration<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> =
  T extends EvaluationType.Rule ? RuleEvaluationConfiguration<M extends RuleEvaluationMetric ? M : never> :
  T extends EvaluationType.Llm ? LlmEvaluationConfiguration<M extends LlmEvaluationMetric ? M : never> :
  T extends EvaluationType.Human ? HumanEvaluationConfiguration<M extends HumanEvaluationMetric ? M : never> :
  T extends EvaluationType.Composite ? CompositeEvaluationConfiguration<M extends CompositeEvaluationMetric ? M : never> :
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
  T extends EvaluationType.Composite ? CompositeEvaluationResultMetadata<M extends CompositeEvaluationMetric ? M : never> :
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
  T extends EvaluationType.Composite ? CompositeEvaluationResultError<M extends CompositeEvaluationMetric ? M : never> :
  never;

// prettier-ignore
export const EvaluationResultErrorSchema = z.custom<EvaluationResultError>()

type ZodSchema<_T = any> = z.ZodObject

export type EvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  name: string
  description: string
  configuration: ZodSchema<EvaluationConfiguration<T, M>>
  resultMetadata: ZodSchema<EvaluationResultMetadata<T, M>>
  resultError: ZodSchema<EvaluationResultError<T, M>>
  resultReason: (result: EvaluationResultSuccessValue<T, M>) => string | undefined // prettier-ignore
  requiresExpectedOutput: boolean
  supportsLiveEvaluation: boolean
  supportsBatchEvaluation: boolean
  supportsManualEvaluation: boolean
}

export type EvaluationSpecification<T extends EvaluationType = EvaluationType> =
  {
    name: string
    description: string
    configuration: ZodSchema<EvaluationConfiguration<T>>
    resultMetadata: ZodSchema<EvaluationResultMetadata<T>>
    resultError: ZodSchema<EvaluationResultError<T>>
    metrics: { [M in EvaluationMetric<T>]: EvaluationMetricSpecification<T, M> }
  }

export const EVALUATION_SPECIFICATIONS = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
  [EvaluationType.Composite]: CompositeEvaluationSpecification,
} as const satisfies {
  [T in EvaluationType]: EvaluationSpecification<T>
}
type EvaluationSpecifications = typeof EVALUATION_SPECIFICATIONS

// prettier-ignore
type EvaluationMetricSpecificationFilter<
  F extends keyof EvaluationMetricSpecification,
  T extends EvaluationType = EvaluationType
> = { [K in EvaluationType]: {
  [M in keyof EvaluationSpecifications[K]['metrics']]:
  // @ts-expect-error F can indeed index M type
  EvaluationSpecifications[K]['metrics'][M][F] extends true ? M : never
}[keyof EvaluationSpecifications[K]['metrics']]
}[T] & EvaluationMetric<T>

export type LiveEvaluationMetric<T extends EvaluationType = EvaluationType> =
  EvaluationMetricSpecificationFilter<'supportsLiveEvaluation', T>

export type BatchEvaluationMetric<T extends EvaluationType = EvaluationType> =
  EvaluationMetricSpecificationFilter<'supportsBatchEvaluation', T>

export type ManualEvaluationMetric<T extends EvaluationType = EvaluationType> =
  EvaluationMetricSpecificationFilter<'supportsManualEvaluation', T>

export type AlignmentMetricMetadata = {
  // Hash used to identify the current configuration of the evaluation, used to detect if we can aggregate to the aligment metric or we have to re-calculate it
  alignmentHash: string
  confusionMatrix: {
    truePositives: number
    trueNegatives: number
    falsePositives: number
    falseNegatives: number
  }
  // Cutoff dates for incremental processing - ISO date strings
  lastProcessedPositiveSpanDate?: string
  lastProcessedNegativeSpanDate?: string
  // ISO date string indicating recalculation is in progress
  recalculatingAt?: string
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
  issueId?: number | null
  name: string
  description: string
  type: T
  metric: M
  alignmentMetricMetadata?: AlignmentMetricMetadata | null
  configuration: EvaluationConfiguration<T, M>
  evaluateLiveLogs?: boolean | null
  enableSuggestions?: boolean | null
  autoApplySuggestions?: boolean | null
  createdAt: Date
  updatedAt: Date
  ignoredAt?: Date | null
  deletedAt?: Date | null
}

export type EvaluationResultSuccessValue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  score: number
  normalizedScore: number
  metadata: EvaluationResultMetadata<T, M>
  hasPassed: boolean
  error?: null
}

export type EvaluationResultErrorValue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  score?: null
  normalizedScore?: null
  metadata?: null
  hasPassed?: null
  error: EvaluationResultError<T, M>
}

export type EvaluationResultValue<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationResultSuccessValue<T, M> | EvaluationResultErrorValue<T, M>

export type EvaluationResultV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  id: number
  uuid: string
  workspaceId: number
  commitId: number
  evaluationUuid: string
  evaluationType?: T | null
  evaluationMetric?: M | null
  experimentId?: number | null
  datasetId?: number | null
  evaluatedRowId?: number | null
  evaluatedLogId?: number | null
  evaluatedSpanId?: string | null
  evaluatedTraceId?: string | null
  issueId?: number | null
  usedForSuggestion?: boolean | null
  createdAt: Date
  updatedAt: Date
} & EvaluationResultValue<T, M>

export type PublicManualEvaluationResultV2 = Pick<
  EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
  | 'uuid'
  | 'score'
  | 'normalizedScore'
  | 'metadata'
  | 'hasPassed'
  | 'createdAt'
  | 'updatedAt'
> & { versionUuid: string; error: string | null }

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
