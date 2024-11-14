import CompileError from '$promptl/error/error'

import { Message } from './message'

export type Config = Record<string, unknown>

export type Conversation = {
  config: Config
  messages: Message[]
}

export type ConversationMetadata = {
  hash: string
  config: Config
  errors: CompileError[]
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
  setConfig: (config: Config) => string
}

export * from './message'
