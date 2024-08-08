export type {
  ChainEvent,
  StreamEventTypes,
  ChainEventTypes,
} from '@latitude-data/core'
export type RunUrlParams = {
  projectId: number
  commitUuid?: string
}
export type GetDocumentUrlParams = {
  projectId: number
  commitUuid?: string
  documentPath: string
}

export enum HandlerType {
  RunDocument = 'run-document',
  GetDocument = 'get-document',
}

export enum EntityType {
  Commit = 'commit',
}

export type BaseParams = {
  entity: EntityType.Commit
  params: RunUrlParams
}

export type UrlParams =
  | {
      handler: HandlerType.RunDocument
      params: RunUrlParams
    }
  | {
      handler: HandlerType.GetDocument
      params: GetDocumentUrlParams
    }
