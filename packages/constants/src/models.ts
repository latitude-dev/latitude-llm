import { Message, ToolCall } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '.'
import { PartialPromptConfig } from './ai'

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
}

// TODO(evalsv2): Remove
export enum EvaluationResultableType {
  Boolean = 'evaluation_resultable_booleans',
  Text = 'evaluation_resultable_texts',
  Number = 'evaluation_resultable_numbers',
}

// TODO(evalsv2): Remove
export type EvaluationResult = {
  id: number
  uuid: string
  evaluationId: number
  documentLogId: number
  evaluatedProviderLogId: number | null
  evaluationProviderLogId: number | null
  resultableType: EvaluationResultableType | null
  resultableId: number | null
  source: LogSources | null
  reason: string | null
  createdAt: Date
  updatedAt: Date
}

// TODO(evalsv2): Remove
export type EvaluationResultDto = EvaluationResult & {
  result: string | number | boolean | undefined
}

export type ProviderLog = {
  id: number
  uuid: string
  documentLogUuid: string | null
  providerId: number | null
  model: string | null
  finishReason: string | null
  config: PartialPromptConfig | null
  messages: Message[]
  responseObject: unknown | null
  responseText: string | null
  toolCalls: ToolCall[]
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
