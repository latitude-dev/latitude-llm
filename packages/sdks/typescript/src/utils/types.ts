import type { Message } from '@latitude-data/compiler'
import { LogSources } from '@latitude-data/core/browser'

export type {
  ChainEvent,
  StreamEventTypes,
  ChainEventTypes,
} from '@latitude-data/core/browser'
export type RunUrlParams = {
  projectId: number
  commitUuid?: string
}

type RunDocumentBodyParam = {
  documentPath: string
  parameters?: Record<string, unknown>
  source?: LogSources
}
type AddMessageBodyParam = {
  documentLogUuid: string
  messages: Message[]
  source?: LogSources
}

export type GetDocumentUrlParams = {
  projectId: number
  commitUuid?: string
  documentPath: string
}

export enum HandlerType {
  RunDocument = 'run-document',
  AddMessageToDocumentLog = 'add-message-to-document-log',
  GetDocument = 'get-document',
}

export type UrlParams<T extends HandlerType> = T extends HandlerType.RunDocument
  ? RunUrlParams
  : T extends HandlerType.GetDocument
    ? GetDocumentUrlParams
    : never

export type BodyParams<T extends HandlerType> =
  T extends HandlerType.RunDocument
    ? RunDocumentBodyParam
    : T extends HandlerType.AddMessageToDocumentLog
      ? AddMessageBodyParam
      : never
