// TODO(tracing): deprecated
export { SpanSource as LogSources } from './tracing'

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

export * from './models'
export * from './ai'
export * from './tools'
export * from './events'
export * from './config'
export * from './helpers'
export * from './mcp'
export * from './evaluations'
export * from './integrations'
export * from './tracing'

// TODO: Move to env
export const EMAIL_TRIGGER_DOMAIN = 'run.latitude.so' as const
