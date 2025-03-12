export enum LogSources {
  API = 'api',
  Playground = 'playground',
  Evaluation = 'evaluation',
  User = 'user',
  SharedPrompt = 'shared_prompt',
  AgentAsTool = 'agent_as_tool',
  EmailTrigger = 'email_trigger',
  ScheduledTrigger = 'scheduled_trigger',
}

export const NON_LIVE_EVALUABLE_LOG_SOURCES = [LogSources.Evaluation]
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

export const EMAIL_TRIGGER_DOMAIN = 'run.latitude.so' as const // TODO: Move to env
