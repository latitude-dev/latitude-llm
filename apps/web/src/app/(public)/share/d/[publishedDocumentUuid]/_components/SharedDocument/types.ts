import type { ConversationMetadata } from 'promptl-ai'

export type ServerClientMetadata = Omit<ConversationMetadata, 'setConfig'> & {
  config: { parameters?: Record<string, { type?: string }> }
}
