import { type InferSelectModel } from 'drizzle-orm'

import { EvaluationResultDto } from '@latitude-data/constants'
import {
  EvaluationMetadataType,
  EvaluationMetric,
  EvaluationResultableType,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../constants'
import { connectedEvaluations } from './legacyModels/connectedEvaluations'
import { evaluationAdvancedTemplates } from './legacyModels/evaluationAdvancedTemplates'
import { evaluationConfigurationBoolean } from './legacyModels/evaluationConfigurationBoolean'
import { evaluationConfigurationNumerical } from './legacyModels/evaluationConfigurationNumerical'
import { evaluationConfigurationText } from './legacyModels/evaluationConfigurationText'
import { evaluationMetadataManual } from './legacyModels/evaluationMetadataDefault'
import { evaluationMetadataLlmAsJudgeAdvanced } from './legacyModels/evaluationMetadataLlmAsJudgeAdvanced'
import { evaluationMetadataLlmAsJudgeSimple } from './legacyModels/evaluationMetadataLlmAsJudgeSimple'
import { evaluations } from './legacyModels/evaluations'
import { evaluationTemplateCategories } from './legacyModels/evaluationTemplateCategories'

import { type User } from './models/types/User'
import { type Session as BaseSession } from './models/types/Session'
import { Commit } from './models/types/Commit'
import { ProviderLog } from './models/types/ProviderLog'
import { Dataset } from './models/types/Dataset'
import { DatasetRow } from './models/types/DatasetRow'

// TODO(evalsv2): deprecated, remove
export type {
  EvaluationResult,
  EvaluationResultDto,
} from '@latitude-data/constants'

export type Session = BaseSession & {
  user: User
}

export type Evaluation = InferSelectModel<typeof evaluations>
export type ConnectedEvaluation = InferSelectModel<typeof connectedEvaluations>
export type EvaluationTemplate = InferSelectModel<
  typeof evaluationAdvancedTemplates
>
export type EvaluationTemplateCategory = InferSelectModel<
  typeof evaluationTemplateCategories
>
export type EvaluationMetadataLlmAsJudgeAdvanced = Omit<
  InferSelectModel<typeof evaluationMetadataLlmAsJudgeAdvanced>,
  'createdAt' | 'updatedAt'
>
export type EvaluationMetadataLlmAsJudgeSimple = Omit<
  InferSelectModel<typeof evaluationMetadataLlmAsJudgeSimple>,
  'createdAt' | 'updatedAt'
>
export type EvaluationMetadataManual = Omit<
  InferSelectModel<typeof evaluationMetadataManual>,
  'createdAt' | 'updatedAt'
>

export type IEvaluationMetadata =
  | EvaluationMetadataLlmAsJudgeAdvanced
  | EvaluationMetadataLlmAsJudgeSimple

export type EvaluationConfigurationBoolean = Omit<
  InferSelectModel<typeof evaluationConfigurationBoolean>,
  'createdAt' | 'updatedAt'
>
export type EvaluationConfigurationNumerical = Omit<
  InferSelectModel<typeof evaluationConfigurationNumerical>,
  'createdAt' | 'updatedAt'
>
export type EvaluationConfigurationText = Omit<
  InferSelectModel<typeof evaluationConfigurationText>,
  'createdAt' | 'updatedAt'
>
export type Cursor<V = string, I = string> = { value: V; id: I }

export type IEvaluationConfiguration =
  | EvaluationConfigurationBoolean
  | EvaluationConfigurationNumerical
  | EvaluationConfigurationText

// TODO(evalsv2): deprecated, remove
// TODO: EvaluationDto now has two polimorphic attributes. There's two ways to define it:
// 1. Use generic types, which is way prettier, but Typescript won't infer the type automatically.
// 2. Use union types, which requires to explicitly define every combination, but works flawlesly with Typescript.
// As you can see, I've decided to go with the second option, but feel free to change it if you want to.
export type EvaluationDto = Evaluation &
  (
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced
        metadata: EvaluationMetadataLlmAsJudgeAdvanced
        resultType: EvaluationResultableType.Boolean
        resultConfiguration: EvaluationConfigurationBoolean
      }
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced
        metadata: EvaluationMetadataLlmAsJudgeAdvanced
        resultType: EvaluationResultableType.Number
        resultConfiguration: EvaluationConfigurationNumerical
      }
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced
        metadata: EvaluationMetadataLlmAsJudgeAdvanced
        resultType: EvaluationResultableType.Text
        resultConfiguration: EvaluationConfigurationText
      }
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple
        metadata: EvaluationMetadataLlmAsJudgeSimple
        resultType: EvaluationResultableType.Boolean
        resultConfiguration: EvaluationConfigurationBoolean
      }
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple
        metadata: EvaluationMetadataLlmAsJudgeSimple
        resultType: EvaluationResultableType.Number
        resultConfiguration: EvaluationConfigurationNumerical
      }
    | {
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple
        metadata: EvaluationMetadataLlmAsJudgeSimple
        resultType: EvaluationResultableType.Text
        resultConfiguration: EvaluationConfigurationText
      }
    | {
        metadataType: EvaluationMetadataType.Manual
        metadata: EvaluationMetadataManual
        resultType: EvaluationResultableType.Boolean
        resultConfiguration: EvaluationConfigurationBoolean
      }
    | {
        metadataType: EvaluationMetadataType.Manual
        metadata: EvaluationMetadataManual
        resultType: EvaluationResultableType.Number
        resultConfiguration: EvaluationConfigurationNumerical
      }
    | {
        metadataType: EvaluationMetadataType.Manual
        metadata: EvaluationMetadataManual
        resultType: EvaluationResultableType.Text
        resultConfiguration: EvaluationConfigurationText
      }
  )

type EvaluationResultNumberConfiguration = {
  range: { from: number; to: number }
}

export type EvaluationResultConfiguration = {
  type: EvaluationResultableType
  detail?: EvaluationResultNumberConfiguration
}

export type EvaluationTemplateWithCategory = EvaluationTemplate & {
  category: string
}

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

export type ResultWithEvaluation = {
  result: EvaluationResultDto
  evaluation: EvaluationDto
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
  evaluatedLog: ProviderLogDto
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
