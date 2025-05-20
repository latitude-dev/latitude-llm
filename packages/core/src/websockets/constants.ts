// ATENTION:
// ::::::::::::::::::::::::::::::::::::::::::
// All this can be seen in the browser. If you want something private
// put in other place.

import {
  Commit,
  DatasetRow,
  Dataset,
  DocumentSuggestion,
  EvaluationResultV2,
  EvaluationV2,
  ExperimentDto,
  ProviderLogDto,
} from '../browser'
import { type DocumentLogWithMetadataAndError } from '../repositories'

const ONE_HOUR = 60 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * ONE_HOUR

export const TOKEN_TYPES = {
  websocket: 'websocket',
  websocketRefresh: 'websocketRefresh',
}

export type TokenType = keyof typeof TOKEN_TYPES
export const TOKEN_CONFIG: Record<
  TokenType,
  { maxAge: { numberValue: number; stringValue: string } }
> = {
  websocket: { maxAge: { numberValue: ONE_HOUR, stringValue: '1h' } },
  websocketRefresh: { maxAge: { numberValue: SEVEN_DAYS, stringValue: '7d' } },
}

export type WebSocketData = {
  userId: string
  workspaceId: number
}
export type WorkerPayload = {}

type DocumentBatchRunStatusArgs = {
  documentUuid: string
  total: number
  completed: number
  errors: number
  enqueued: number
}

type ExperimentStatusArgs = {
  experiment: ExperimentDto
}

type DocumentLogCreatedArgs = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  documentLogId: number
  documentLogWithMetadata: DocumentLogWithMetadataAndError
}

type DocumentSuggestionCreatedArgs = {
  workspaceId: number
  suggestion: DocumentSuggestion
  evaluation: EvaluationV2
}

type DatasetRowsCreatedArgs =
  | {
      datasetId: number
      error: null
      rows: DatasetRow[]
      finished: false
    }
  | { datasetId: number; error: Error; rows: null; finished: false }
  | { datasetId: number; error: null; rows: null; finished: true }

type EvaluationResultV2CreatedArgs = {
  workspaceId: number
  result: EvaluationResultV2
  evaluation: EvaluationV2
  commit: Commit
  providerLog: ProviderLogDto
  dataset?: Dataset
  datasetRow?: DatasetRow
}

export type WebServerToClientEvents = {
  documentBatchRunStatus: (args: DocumentBatchRunStatusArgs) => void
  experimentStatus: (args: ExperimentStatusArgs) => void
  datasetRowsCreated: (args: DatasetRowsCreatedArgs) => void
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
  documentLogCreated: (args: DocumentLogCreatedArgs) => void
  documentSuggestionCreated: (args: DocumentSuggestionCreatedArgs) => void
  evaluationResultV2Created: (args: EvaluationResultV2CreatedArgs) => void
  mcpServerScaleEvent: (args: {
    workspaceId: number
    replicas: number
    mcpServerId: number
  }) => void
  mcpServerConnected: (args: {
    workspaceId: number
    mcpServerId: number
  }) => void
}

export type WebClientToServerEvents = {
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
}

export type WorkersClientToServerEvents = {
  documentBatchRunStatus: (args: {
    workspaceId: number
    data: DocumentBatchRunStatusArgs
  }) => void
  datasetRowsCreated: (args: {
    workspaceId: number
    data: DatasetRowsCreatedArgs
  }) => void
  documentLogCreated: (args: {
    workspaceId: number
    data: DocumentLogCreatedArgs
  }) => void
  documentSuggestionCreated: (args: {
    workspaceId: number
    data: DocumentSuggestionCreatedArgs
  }) => void
  evaluationResultV2Created: (args: {
    workspaceId: number
    data: EvaluationResultV2CreatedArgs
  }) => void
  experimentStatus: (args: {
    workspaceId: number
    data: ExperimentStatusArgs
  }) => void
  mcpServerScaleEvent: (args: {
    workspaceId: number
    data: {
      workspaceId: number
      replicas: number
      mcpServerId: number
    }
  }) => void
  mcpServerConnected: (args: {
    workspaceId: number
    data: {
      workspaceId: number
      mcpServerId: number
    }
  }) => void
}
