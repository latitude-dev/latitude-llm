import { LogSources } from '.'
import { Message, ToolCall } from '@latitude-data/compiler'
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
}

export enum EvaluationResultableType {
  Boolean = 'evaluation_resultable_booleans',
  Text = 'evaluation_resultable_texts',
  Number = 'evaluation_resultable_numbers',
}

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
  documentUuid: string
  path: string
  content: string
  resolvedContent: string
  contentHash: string
  promptlVersion: number
  commitId: number
  datasetId: number | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
