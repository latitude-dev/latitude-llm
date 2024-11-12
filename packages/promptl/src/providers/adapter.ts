import { Message, Conversation as PromptlConversation } from '$promptl/types'

export type ProviderConversation<M extends object> = {
  config: PromptlConversation['config']
  messages: M[]
}

export type ProviderAdapter<M extends object> = {
  toPromptl(conversation: ProviderConversation<M>): PromptlConversation
  fromPromptl(conversation: PromptlConversation): ProviderConversation<M>
}

export const defaultAdapter: ProviderAdapter<Message> = {
  toPromptl: (c) => c,
  fromPromptl: (c) => c,
}
