import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import type {
  DocumentLog,
  DocumentTriggerType,
  EvaluationResultDto,
  ExperimentScores,
  IntegrationType,
} from '@latitude-data/constants'
import type {
  EvaluationMetadataType,
  EvaluationMetric,
  EvaluationResultableType,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../constants'
import type {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
  DocumentTriggerEventPayload,
} from '@latitude-data/constants/documentTriggers'
import type { IntegrationConfiguration } from '../services/integrations/helpers/schema'
import type { connectedEvaluations } from './legacyModels/connectedEvaluations'
import type { evaluationAdvancedTemplates } from './legacyModels/evaluationAdvancedTemplates'
import type { evaluationConfigurationBoolean } from './legacyModels/evaluationConfigurationBoolean'
import type { evaluationConfigurationNumerical } from './legacyModels/evaluationConfigurationNumerical'
import type { evaluationConfigurationText } from './legacyModels/evaluationConfigurationText'
import type { evaluationMetadataManual } from './legacyModels/evaluationMetadataDefault'
import type { evaluationMetadataLlmAsJudgeAdvanced } from './legacyModels/evaluationMetadataLlmAsJudgeAdvanced'
import type { evaluationMetadataLlmAsJudgeSimple } from './legacyModels/evaluationMetadataLlmAsJudgeSimple'
import type { evaluations } from './legacyModels/evaluations'
import type { evaluationTemplateCategories } from './legacyModels/evaluationTemplateCategories'
import type { apiKeys } from './models/apiKeys'
import type { claimedRewards } from './models/claimedRewards'
import type { commits } from './models/commits'
import type { datasetRows } from './models/datasetRows'
import type { datasets } from './models/datasets'
import type { documentSuggestions } from './models/documentSuggestions'
import type { documentTriggers } from './models/documentTriggers'
import type { documentVersions } from './models/documentVersions'
import type { experiments } from './models/experiments'
import type { latitudeExports } from './models/exports'
import type { integrations } from './models/integrations'
import type { magicLinkTokens } from './models/magicLinkTokens'
import type { mcpServers } from './models/mcpServers'
import type { memberships } from './models/memberships'
import type { projects } from './models/projects'
import type { providerApiKeys } from './models/providerApiKeys'
import type { providerLogs } from './models/providerLogs'
import type { publishedDocuments } from './models/publishedDocuments'
import type { runErrors } from './models/runErrors'
import type { sessions } from './models/sessions'
import type { subscriptions } from './models/subscriptions'
import type { users } from './models/users'
import type { workspaces } from './models/workspaces'
import type { latteThreads } from './models/latteThreads'
import type { latteThreadCheckpoints } from './models/latteThreadCheckpoints'
import type { features } from './models/features'
import type { workspaceFeatures } from './models/workspaceFeatures'
import type { documentTriggerEvents } from './models/documentTriggerEvents'

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
export type EvaluationTemplate = InferSelectModel<typeof evaluationAdvancedTemplates>
export type MagicLinkToken = InferSelectModel<typeof magicLinkTokens>
export type ClaimedReward = InferSelectModel<typeof claimedRewards>
export type EvaluationTemplateCategory = InferSelectModel<typeof evaluationTemplateCategories>
export type Subscription = InferSelectModel<typeof subscriptions>
export type Export = typeof latitudeExports.$inferSelect
export type NewExport = typeof latitudeExports.$inferInsert

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
export type LatteThread = InferSelectModel<typeof latteThreads>
export type LatteThreadCheckpoint = InferSelectModel<typeof latteThreadCheckpoints>
export type Feature = InferSelectModel<typeof features>
export type WorkspaceFeature = InferSelectModel<typeof workspaceFeatures>

export type Cursor<V = string, I = string> = { value: V; id: I }

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

export type ProviderLogDto = Omit<ProviderLog, 'responseText' | 'responseObject'> & {
  response: string
}

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

export type DocumentSuggestionWithDetails = DocumentSuggestion & {
  evaluation: EvaluationV2
}

export type Integration = InferSelectModel<typeof integrations>
export type IntegrationDto = Omit<Integration, 'configuration' | 'type'> & IntegrationConfiguration
export type PipedreamIntegration = Extract<IntegrationDto, { type: IntegrationType.Pipedream }>

export type PipedreamIntegrationWithAcountCount = PipedreamIntegration & {
  accountCount: number
}
export type PipedreamIntegrationWithCounts = PipedreamIntegrationWithAcountCount & {
  triggerCount: number
}

type _DocumentTrigger = InferSelectModel<typeof documentTriggers>
export type DocumentTrigger<T extends DocumentTriggerType = DocumentTriggerType> = Omit<
  _DocumentTrigger,
  'triggerType' | 'configuration' | 'deploymentSettings'
> & {
  triggerType: T
  configuration: DocumentTriggerConfiguration<T>
  deploymentSettings: DocumentTriggerDeploymentSettings<T> | null
}

export type DocumentTriggerEvent<T extends DocumentTriggerType = DocumentTriggerType> =
  InferSelectModel<typeof documentTriggerEvents> & {
    triggerType: T
    payload: DocumentTriggerEventPayload<T>
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

export type Experiment = InferSelectModel<typeof experiments>
export type ExperimentAggregatedResults = {
  passed: number
  failed: number
  errors: number
  totalScore: number
}
export type ExperimentDto = Experiment & {
  results: ExperimentAggregatedResults
}
export type ExperimentLogsMetadata = {
  totalCost: number
  totalTokens: number
  totalDuration: number
  count: number
}
export type ExperimentWithScores = ExperimentDto & {
  scores: ExperimentScores
  logsMetadata: ExperimentLogsMetadata
}

export type RunErrorField = {
  code: string | null
  message: string | null
  details: string | null
}

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

export type DocumentLogWithMetadataAndError = DocumentLogWithMetadata & {
  error: RunErrorField
}

export type DocumentLogsAggregations = {
  totalCount: number
  totalTokens: number
  totalCostInMillicents: number
  averageTokens: number
  averageCostInMillicents: number
  medianCostInMillicents: number
  averageDuration: number
  medianDuration: number
}

export type DocumentLogsLimitedView = DocumentLogsAggregations & {
  dailyCount: { date: string; count: number }[]
}

export interface ProjectStats {
  totalTokens: number
  totalRuns: number
  totalDocuments: number
  runsPerModel: Record<string, number>
  costPerModel: Record<string, number>
  rollingDocumentLogs: Array<{ date: string; count: number }>
  totalEvaluations: number
  totalEvaluationResults: number
  costPerEvaluation: Record<string, number>
}

export type ProjectLimitedView = ProjectStats
