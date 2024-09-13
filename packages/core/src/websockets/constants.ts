// ATENTION:
// ::::::::::::::::::::::::::::::::::::::::::
// All this can be seen in the browser. If you want something private
// put in other place.

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
  batchId: string
  evaluationId: number
  documentUuid: string
  status: 'started' | 'running' | 'finished'
  initialTotal: number
  total: number
  completed: number
  errors: number
  enqueued: number
}
export type WebServerToClientEvents = {
  evaluationStatus: (args: EvaluationStatusArgs) => void
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
}
export type WebClientToServerEvents = {
  joinWorkspace: (args: { workspaceId: number; userId: string }) => void
}

export type WorkersClientToServerEvents = {
  evaluationStatus: (args: {
    data: EvaluationStatusArgs
    workspaceId: number
  }) => void
}
