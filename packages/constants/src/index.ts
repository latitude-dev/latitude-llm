// TODO(tracing): deprecated
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
  Integration = 'integration',
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

// TODO: Remove these
export * from './ai'
export * from './config'
export * from './evaluations'
export * from './events'
export * from './helpers'
export * from './integrations'
export * from './mcp'
export * from './models'
export * from './tools'
export * from './tracing'
export * from './history'

// TODO: Move to env
export const EMAIL_TRIGGER_DOMAIN = 'run.latitude.so' as const
export const OPENAI_PROVIDER_ENDPOINTS = ['chat_completions', 'responses'] as const
