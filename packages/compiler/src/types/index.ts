import { Message } from './message'

export type Config = Record<string, unknown>

export type Conversation = {
  config: Config
  messages: Message[]
}

export type ConversationMetadata = {
  hash: string // Unique string identifying the conversation
  config: Config
  parameters: Set<string> // Variables used in the prompt that have not been defined in runtime
  referencedPrompts: Set<string>
}

export * from './message'
