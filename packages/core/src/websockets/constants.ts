// ATENTION:
// ::::::::::::::::::::::::::::::::::::::::::
// All this can be seen in the browser. If you want something private
// put in other place.

import type {
  Commit,
  Dataset,
  DatasetRow,
  DocumentLogWithMetadataAndError,
  DocumentSuggestion,
  EvaluationResultV2,
  EvaluationV2,
  ExperimentDto,
  ProviderLogDto,
} from '../browser'
import { LatteChange } from '@latitude-data/constants/latte'

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

type McpServerScaleEventArgs = {
  workspaceId: number
  replicas: number
  mcpServerId: number
}

type McpServerConnectedArgs = {
  workspaceId: number
  mcpServerId: number
}

type LatteThreadResponse = {
  type: 'response'
  response: string
}

type LatteThreadToolStarted = {
  type: 'toolStarted'
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
}

type LatteThreadToolCompleted = {
  type: 'toolCompleted'
  toolName: string
  toolCallId: string
  result: Record<string, unknown> | { error: { name: string; message: string } }
}

type LatteThreadError = {
  type: 'error'
  error: { name: string; message: string }
}

export type LatteThreadUpdateArgs = {
  threadUuid: string
} & (
  | LatteThreadResponse
  | LatteThreadToolStarted
  | LatteThreadToolCompleted
  | LatteThreadError
)

export type WebServerToClientEvents = {
  documentBatchRunStatus: (args: DocumentBatchRunStatusArgs) => void
  experimentStatus: (args: ExperimentStatusArgs) => void
  datasetRowsCreated: (args: DatasetRowsCreatedArgs) => void
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
  documentLogCreated: (args: DocumentLogCreatedArgs) => void
  documentSuggestionCreated: (args: DocumentSuggestionCreatedArgs) => void
  evaluationResultV2Created: (args: EvaluationResultV2CreatedArgs) => void
  mcpServerScaleEvent: (args: McpServerScaleEventArgs) => void
  mcpServerConnected: (args: McpServerConnectedArgs) => void
  latteThreadUpdate: (args: LatteThreadUpdateArgs) => void
  latteProjectChanges: (args: {
    threadUuid: string
    changes: LatteChange[]
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
    data: McpServerScaleEventArgs
  }) => void
  mcpServerConnected: (args: {
    workspaceId: number
    data: McpServerConnectedArgs
  }) => void
  latteThreadUpdate: (args: {
    workspaceId: number
    data: LatteThreadUpdateArgs
  }) => void
  latteProjectChanges: (args: {
    workspaceId: number
    data: { threadUuid: string; changes: LatteChange[] }
  }) => void
}
