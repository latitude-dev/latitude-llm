import type CompileError from '$compiler/error/error'

import type { Message } from './message'

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
  setConfig: (config: Config) => string
  includedPromptPaths: Set<string>
}

export * from './message'
