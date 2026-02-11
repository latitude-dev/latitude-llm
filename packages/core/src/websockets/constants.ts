// ATENTION:
// ::::::::::::::::::::::::::::::::::::::::::
// All this can be seen in the browser. If you want something private
// put in other place.

import {
  ActiveEvaluation,
  ActiveRun,
  AlignmentMetricMetadata,
  DocumentLogWithMetadataAndError,
  EvaluationResultV2,
  EvaluationV2,
  LatteChange,
  LatteUsage,
  Span,
} from '../constants'
import { Conversation } from '../data-access/conversations/fetchConversation'

import { DocumentRunStatusEvent, EvaluationStatusEvent } from '../events/events'
import { Commit } from '../schema/models/types/Commit'
import type { Dataset } from '../schema/models/types/Dataset'
import type { DatasetRow } from '../schema/models/types/DatasetRow'
import type { DocumentTrigger } from '../schema/models/types/DocumentTrigger'
import type { DocumentTriggerEvent } from '../schema/models/types/DocumentTriggerEvent'
import type { ExperimentDto } from '../schema/models/types/Experiment'
import type { Project } from '../schema/models/types/Project'
import type { OptimizationWithDetails } from '../schema/types'

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

type EvaluationStatusArgs = {
  event: EvaluationStatusEvent['type']
  workspaceId: number
  projectId: number
  evaluation: ActiveEvaluation
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
  dataset?: Dataset
  datasetRow?: DatasetRow
}

type ProjectUpdatedArgs = {
  workspaceId: number
  project: Project
}

type DocumentTriggerCreatedArgs = {
  workspaceId: number
  trigger: DocumentTrigger
}

type DocumentTriggerEventCreatedArgs = {
  workspaceId: number
  commit: Commit
  triggerEvent: DocumentTriggerEvent
}

type DocumentTriggerDeletedArgs = {
  workspaceId: number
  trigger: DocumentTrigger
}

type LatteThreadResponse = {
  type: 'fullResponse'
  response: string
}

type LatteThreadResponseDelta = {
  type: 'responseDelta'
  delta: string
}

type LatteThreadToolStarted = {
  type: 'toolStarted'
  toolName: string
  toolCallId: string
  debugMode: boolean
  args: Record<string, unknown>
}

type LatteThreadToolCompleted = {
  type: 'toolCompleted'
  toolName: string
  toolCallId: string
  result: Record<string, unknown> | { error: { name: string; message: string } }
}

type LatteThreadUsage = {
  type: 'usage'
  usage: LatteUsage
}

type LatteThreadError = {
  type: 'error'
  error: { name: string; message: string }
}

export type LatteThreadUpdateArgs = {
  threadUuid: string
} & (
  | LatteThreadResponseDelta
  | LatteThreadResponse
  | LatteThreadToolStarted
  | LatteThreadToolCompleted
  | LatteThreadUsage
  | LatteThreadError
)

export type LatteProjectChangesArgs = {
  threadUuid: string
  changes: LatteChange[]
}

export type DocumentRunMetrics = {
  runUsage: {
    inputTokens: number
    outputTokens: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    reasoningTokens: number
    cachedInputTokens: number
  }
  runCost: number
  duration: number
}

type DocumentRunStatusArgs = {
  event: DocumentRunStatusEvent['type']
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  run: ActiveRun
  metrics?: DocumentRunMetrics
  experimentId?: number
}

type SpanCreatedArgs = {
  workspaceId: number
  documentUuid: string
  span: Span
}

type ConversationUpdatedArgs = {
  workspaceId: number
  documentUuid: string
  conversation: Conversation
}

type EvaluationV2AlignmentMetricUpdatedArgs = {
  evaluationUuid: string
  alignmentMetricMetadata: AlignmentMetricMetadata | undefined
}

type OptimizationStatusArgs = {
  workspaceId: number
  optimization: OptimizationWithDetails
}

export type WebServerToClientEvents = {
  evaluationStatus: (args: EvaluationStatusArgs) => void
  evaluationV2AlignmentMetricUpdated: (
    args: EvaluationV2AlignmentMetricUpdatedArgs,
  ) => void
  experimentStatus: (args: ExperimentStatusArgs) => void
  datasetRowsCreated: (args: DatasetRowsCreatedArgs) => void
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
  documentLogCreated: (args: DocumentLogCreatedArgs) => void
  evaluationResultV2Created: (args: EvaluationResultV2CreatedArgs) => void
  projectUpdated: (args: ProjectUpdatedArgs) => void
  triggerCreated: (args: DocumentTriggerCreatedArgs) => void
  triggerDeleted: (args: DocumentTriggerDeletedArgs) => void
  triggerEventCreated: (args: DocumentTriggerEventCreatedArgs) => void
  latteThreadUpdate: (args: LatteThreadUpdateArgs) => void
  latteProjectChanges: (args: LatteProjectChangesArgs) => void
  documentRunStatus: (args: DocumentRunStatusArgs) => void
  spanCreated: (args: SpanCreatedArgs) => void
  conversationUpdated: (args: ConversationUpdatedArgs) => void
  optimizationStatus: (args: OptimizationStatusArgs) => void
}

export type WebClientToServerEvents = {
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
}

export type WorkersClientToServerEvents = {
  datasetRowsCreated: (args: {
    workspaceId: number
    data: DatasetRowsCreatedArgs
  }) => void
  documentLogCreated: (args: {
    workspaceId: number
    data: DocumentLogCreatedArgs
  }) => void
  evaluationResultV2Created: (args: {
    workspaceId: number
    data: EvaluationResultV2CreatedArgs
  }) => void
  evaluationV2AlignmentMetricUpdated: (args: {
    workspaceId: number
    data: EvaluationV2AlignmentMetricUpdatedArgs
  }) => void
  experimentStatus: (args: {
    workspaceId: number
    data: ExperimentStatusArgs
  }) => void
  projectUpdated: (args: {
    workspaceId: number
    data: ProjectUpdatedArgs
  }) => void
  triggerCreated: (args: {
    workspaceId: number
    data: DocumentTriggerCreatedArgs
  }) => void
  triggerDeleted: (args: {
    workspaceId: number
    data: DocumentTriggerDeletedArgs
  }) => void
  triggerEventCreated: (args: {
    workspaceId: number
    data: DocumentTriggerEventCreatedArgs
  }) => void
  latteThreadUpdate: (args: {
    workspaceId: number
    data: LatteThreadUpdateArgs
  }) => void
  latteProjectChanges: (args: {
    workspaceId: number
    data: LatteProjectChangesArgs
  }) => void
  documentRunStatus: (args: {
    workspaceId: number
    data: DocumentRunStatusArgs
  }) => void
  spanCreated: (args: { workspaceId: number; data: SpanCreatedArgs }) => void
  conversationUpdated: (args: {
    workspaceId: number
    data: ConversationUpdatedArgs
  }) => void
  optimizationStatus: (args: {
    workspaceId: number
    data: OptimizationStatusArgs
  }) => void
}
