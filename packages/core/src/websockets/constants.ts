// ATENTION:
// ::::::::::::::::::::::::::::::::::::::::::
// All this can be seen in the browser. If you want something private
// put in other place.

import { Span, Trace } from '../browser'
import {
  type DocumentLogWithMetadataAndError,
  type EvaluationResultWithMetadataAndErrors,
} from '../repositories'

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

type EvaluationStatusArgs = {
  batchId: string
  evaluationId: number
  documentUuid: string
  total: number
  completed: number
  errors: number
  enqueued: number
}

type EvaluationResultCreatedArgs = {
  workspaceId: number
  evaluationId: number
  documentUuid: string
  evaluationResultId: number
  row: EvaluationResultWithMetadataAndErrors
}

type DocumentLogCreatedArgs = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  documentLogId: number
  documentLogWithMetadata: DocumentLogWithMetadataAndError
}

export type WebServerToClientEvents = {
  documentBatchRunStatus: (args: DocumentBatchRunStatusArgs) => void
  evaluationStatus: (args: EvaluationStatusArgs) => void
  evaluationResultCreated: (args: EvaluationResultCreatedArgs) => void
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
  documentLogCreated: (args: DocumentLogCreatedArgs) => void
  tracesAndSpansCreated: (args: {
    workspaceId: number
    projectId: number
    traces: Trace[]
    spans: Span[]
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
  evaluationStatus: (args: {
    workspaceId: number
    data: EvaluationStatusArgs
  }) => void
  evaluationResultCreated: (args: {
    workspaceId: number
    data: EvaluationResultCreatedArgs
  }) => void
  documentLogCreated: (args: {
    workspaceId: number
    data: DocumentLogCreatedArgs
  }) => void
  tracesAndSpansCreated: (args: {
    workspaceId: number
    data: {
      workspaceId: number
      projectId: number
      traces: Trace[]
      spans: Span[]
    }
  }) => void
}
