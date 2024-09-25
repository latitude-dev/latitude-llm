import type { Message } from '@latitude-data/compiler'

export type {
  ChainEvent,
  StreamEventTypes,
  ChainEventTypes,
} from '@latitude-data/core/browser'
export type RunUrlParams = {
  projectId: number
  versionUuid?: string
}
export type ChatUrlParams = {
  conversationUuid: string
}

type RunDocumentBodyParam = {
  path: string
  parameters?: Record<string, unknown>
}
type ChatBodyParams = {
  messages: Message[]
}

export type GetDocumentUrlParams = {
  projectId: number
  versionUuid?: string
  path: string
}

export enum HandlerType {
  Chat = 'chat',
  GetDocument = 'get-document',
  RunDocument = 'run-document',
}

export type UrlParams<T extends HandlerType> = T extends HandlerType.RunDocument
  ? RunUrlParams
  : T extends HandlerType.GetDocument
    ? GetDocumentUrlParams
    : T extends HandlerType.Chat
      ? ChatUrlParams
      : never

export type BodyParams<T extends HandlerType> =
  T extends HandlerType.RunDocument
    ? RunDocumentBodyParam
    : T extends HandlerType.Chat
      ? ChatBodyParams
      : never
