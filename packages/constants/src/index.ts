/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// TODO(tracing): deprecated
export { SpanSource as LogSources } from './tracing'

export const HEAD_COMMIT = 'live'

export enum Providers {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Groq = 'groq',
  Mistral = 'mistral',
  Azure = 'azure',
  Google = 'google',
  GoogleVertex = 'google_vertex',
  AnthropicVertex = 'anthropic_vertex',
  Custom = 'custom',
  XAI = 'xai',
  AmazonBedrock = 'amazon_bedrock',
  DeepSeek = 'deepseek',
  Perplexity = 'perplexity',
}

export enum DocumentType {
  Prompt = 'prompt',
  Agent = 'agent',
}

export enum DocumentTriggerType {
  Email = 'email',
  Scheduled = 'scheduled',
}

export enum DocumentTriggerParameters {
  SenderEmail = 'senderEmail',
  SenderName = 'senderName',
  Subject = 'subject',
  Body = 'body',
  Attachments = 'attachments',
}

export type ExperimentMetadata = {
  prompt: string
  promptHash: string
  parametersMap: Record<string, number>
  datasetLabels: Record<string, string> // name for the expected output column in golden datasets, based on evaluation uuid
  fromRow?: number
  toRow?: number
  count: number // Total number of to generate logs in the experiment
}

export type ExperimentEvaluationScore = {
  count: number
  totalScore: number
  totalNormalizedScore: number
}

export type ExperimentScores = {
  [evaluationUuid: string]: ExperimentEvaluationScore
}

export * from './errors'
export * from './evaluations'
export * from './events'
export * from './latitudePromptSchema'
export * from './latte'
export * from './tracing'
export * from './ai'
export * from './config'
export * from './models'
export * from './tools'

// TODO: Move to env
export const EMAIL_TRIGGER_DOMAIN = 'run.latitude.so' as const
export const OPENAI_PROVIDER_ENDPOINTS = [
  'chat_completions',
  'responses',
] as const

export * from './helpers'
export * from './mcp'
export * from './integrations'
