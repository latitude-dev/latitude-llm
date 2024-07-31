import CompileError from '$compiler/error/error'

import { Message } from './message'

// TODO: Improve this type
export type Config = Record<string, unknown>

export type Conversation = {
  config: Config
  messages: Message[]
}

export type ConversationMetadata = {
  resolvedPrompt: string
  config: Config
  errors: CompileError[]
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
}

export * from './message'
