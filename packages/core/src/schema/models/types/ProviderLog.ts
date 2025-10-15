import { type InferSelectModel } from 'drizzle-orm'

import { providerLogs } from '../providerLogs'

export type ProviderLog = InferSelectModel<typeof providerLogs>

export type ProviderLogFileData = {
  config: ProviderLog['config'] | null
  messages: ProviderLog['messages'] | null
  output: ProviderLog['output'] | null
  responseObject: ProviderLog['responseObject'] | null
  responseText: ProviderLog['responseText'] | null
  responseReasoning: ProviderLog['responseReasoning'] | null
  toolCalls: ProviderLog['toolCalls'] | null
}

export type HydratedProviderLog = Omit<
  ProviderLog,
  | 'config'
  | 'messages'
  | 'output'
  | 'responseObject'
  | 'responseText'
  | 'responseReasoning'
  | 'toolCalls'
> &
  ProviderLogFileData
