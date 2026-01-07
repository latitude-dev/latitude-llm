import { Message, ToolCall } from '@latitude-data/constants/legacyCompiler'
import { PartialPromptConfig } from './ai'

export enum LogSources {
  API = 'api',
  AgentAsTool = 'agent_as_tool',
  Copilot = 'copilot',
  EmailTrigger = 'email_trigger',
  Evaluation = 'evaluation',
  Experiment = 'experiment',
  IntegrationTrigger = 'integration_trigger',
  Playground = 'playground',
  ScheduledTrigger = 'scheduled_trigger',
  SharedPrompt = 'shared_prompt',
  ShadowTest = 'shadow_test',
  ABTestChallenger = 'ab_test_challenger',
  User = 'user',
  Optimization = 'optimization',
}

type Commit = {
  id: number
  uuid: string
  title: string
  description: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  projectId: number
  version: number | null
  userId: string
  mergedAt: Date | null
  mainDocumentUuid: string | null
}

export type DocumentLog = {
  id: number
  uuid: string
  documentUuid: string
  commitId: number
  resolvedContent: string
  contentHash: string
  parameters: Record<string, unknown>
  customIdentifier: string | null
  duration: number | null
  source: LogSources | null
  createdAt: Date
  updatedAt: Date
  experimentId: number | null
  workspaceId: number | null
}

export type DocumentLogWithMetadata = DocumentLog & {
  commit: Commit
  tokens: number | null
  duration: number | null
  costInMillicents: number | null
}

export type RunErrorField = {
  code: string | null
  message: string | null
  details: string | null
}

export type DocumentLogWithMetadataAndError = DocumentLogWithMetadata & {
  error: RunErrorField
}

export type ProviderLog = {
  id: number
  uuid: string
  documentLogUuid: string | null
  providerId: number | null
  model: string | null
  finishReason: string | null
  config: PartialPromptConfig | null
  messages: Message[] | null
  responseObject: unknown | null
  responseText: string | null
  toolCalls: ToolCall[] | null
  tokens: number | null
  costInMillicents: number | null
  duration: number | null
  source: LogSources | null
  apiKeyId: number | null
  generatedAt: Date | null
  updatedAt: Date
}

export type DocumentVersion = {
  id: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  documentUuid: string
  commitId: number
  path: string
  content: string
  resolvedContent: string | null
  contentHash: string | null
  datasetId: number | null
  datasetV2Id: number | null
}

export type SimplifiedDocumentVersion = {
  documentUuid: string
  path: string
  content: string
  isDeleted: boolean
}
