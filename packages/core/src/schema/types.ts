import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm'

import {
  EvaluationMetadataType,
  EvaluationMetric,
  EvaluationResultableType,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../constants'
import { apiKeys } from './models/apiKeys'
import { claimedRewards } from './models/claimedRewards'
import { commits } from './models/commits'
import { connectedEvaluations } from './models/connectedEvaluations'
// DEPRECATED: we need to run migration and create new records in datasetsV2 for all existing datasets
import { EvaluationResultDto } from '@latitude-data/constants'
import { DocumentTriggerWithConfiguration } from '../services/documentTriggers/helpers/schema'
import { IntegrationConfiguration } from '../services/integrations/helpers/schema'
import { datasetRows } from './models/datasetRows'
import { datasets } from './models/datasets'
import { datasetsV2 } from './models/datasetsV2'
import { documentSuggestions } from './models/documentSuggestions'
import { documentTriggers } from './models/documentTriggers'
import { documentVersions } from './models/documentVersions'
import { evaluationAdvancedTemplates } from './models/evaluationAdvancedTemplates'
import { evaluationConfigurationBoolean } from './models/evaluationConfigurationBoolean'
import { evaluationConfigurationNumerical } from './models/evaluationConfigurationNumerical'
import { evaluationConfigurationText } from './models/evaluationConfigurationText'
import { evaluationMetadataManual } from './models/evaluationMetadataDefault'
import { evaluationMetadataLlmAsJudgeAdvanced } from './models/evaluationMetadataLlmAsJudgeAdvanced'
import { evaluationMetadataLlmAsJudgeSimple } from './models/evaluationMetadataLlmAsJudgeSimple'
import { evaluations } from './models/evaluations'
import { evaluationTemplateCategories } from './models/evaluationTemplateCategories'
import { integrations } from './models/integrations'
import { magicLinkTokens } from './models/magicLinkTokens'
import { mcpServers } from './models/mcpServers'
import { memberships } from './models/memberships'
import { projects } from './models/projects'
import { providerApiKeys } from './models/providerApiKeys'
import { providerLogs } from './models/providerLogs'
import { publishedDocuments } from './models/publishedDocuments'
import { runErrors } from './models/runErrors'
import { sessions } from './models/sessions'
import { spans } from './models/spans'
import { subscriptions } from './models/subscriptions'
import { traces } from './models/traces'
import { users } from './models/users'
import { workspaces } from './models/workspaces'

export type {
  DocumentLog,
  EvaluationResult,
  EvaluationResultDto,
  EvaluationResultV2,
  EvaluationV2,
} from '@latitude-data/constants'

// Model types are out of schema files to be able to share with NextJS webpack bundler
// otherwise, it will throw an error.
export type Workspace = InferSelectModel<typeof workspaces>
export type User = InferSelectModel<typeof users>
export type Session = InferSelectModel<typeof sessions> & {
  user: User
}
export type Membership = InferSelectModel<typeof memberships>
export type ProviderApiKey = InferSelectModel<typeof providerApiKeys>
export type ApiKey = InferSelectModel<typeof apiKeys>
export type Commit = InferSelectModel<typeof commits>
export type DocumentVersion = InferSelectModel<typeof documentVersions>
export type DocumentSuggestion = InferSelectModel<typeof documentSuggestions>
export type Project = InferSelectModel<typeof projects>
export type ProviderLog = InferSelectModel<typeof providerLogs>
export type RunError = InferSelectModel<typeof runErrors>
export type RunErrorInsert = InferInsertModel<typeof runErrors>
export type Evaluation = InferSelectModel<typeof evaluations>
export type ConnectedEvaluation = InferSelectModel<typeof connectedEvaluations>
export type EvaluationTemplate = InferSelectModel<
  typeof evaluationAdvancedTemplates
>
export type MagicLinkToken = InferSelectModel<typeof magicLinkTokens>
export type ClaimedReward = InferSelectModel<typeof claimedRewards>
export type EvaluationTemplateCategory = InferSelectModel<
  typeof evaluationTemplateCategories
>
export type Subscription = InferSelectModel<typeof subscriptions>
export type Trace = InferSelectModel<typeof traces>
export type Span = InferSelectModel<typeof spans>

export type McpServer = InferSelectModel<typeof mcpServers>

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

export type IEvaluationConfiguration =
  | EvaluationConfigurationBoolean
  | EvaluationConfigurationNumerical
  | EvaluationConfigurationText

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

export type Dataset = InferSelectModel<typeof datasets> & {
  author: Pick<User, 'id' | 'name'> | undefined
}

export type DatasetV2 = InferSelectModel<typeof datasetsV2> & {
  author: Pick<User, 'id' | 'name'> | undefined
}

export type DatasetRow = InferSelectModel<typeof datasetRows>

export type PublishedDocument = InferInsertModel<typeof publishedDocuments>

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

export type ClaimedRewardWithUserInfo = ClaimedReward & {
  workspaceName: string | null
  userName: string | null
  userEmail: string | null
}

export type WorkspaceDto = Workspace & {
  currentSubscription: Subscription
}

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

export type SpanEvent = {
  name: string
  timestamp: string
  attributes?: Record<string, string | number | boolean>
}

export type SpanLink = {
  traceId: string
  spanId: string
  attributes?: Record<string, string | number | boolean>
}

export type TraceAttributes = Record<string, string | number | boolean>

export type DocumentSuggestionWithDetails = DocumentSuggestion & {
  evaluation: EvaluationTmp
}

export type Integration = InferSelectModel<typeof integrations>
export type IntegrationDto = Omit<Integration, 'configuration' | 'type'> &
  IntegrationConfiguration

type _DocumentTrigger = InferSelectModel<typeof documentTriggers>
export type DocumentTrigger = Omit<_DocumentTrigger, 'configuration' | 'type'> &
  DocumentTriggerWithConfiguration

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
  dataset?: DatasetV2
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

// TODO: Remove when we migrate to v2
export type EvaluationTmp =
  | (EvaluationDto & { version: 'v1' })
  | (EvaluationV2 & { version: 'v2' })

// TODO: Remove when we migrate to v2
export type EvaluationResultTmp =
  | (EvaluationResultDto & { version: 'v1' })
  | (EvaluationResultV2 & { version: 'v2' })

// TODO: Remove when we migrate to v2
export type ResultWithEvaluationTmp =
  | (ResultWithEvaluation & { version: 'v1' })
  | (ResultWithEvaluationV2 & { version: 'v2' })
