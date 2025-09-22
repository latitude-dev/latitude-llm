import { DocumentLogWithMetadataAndError } from './models'

export type Run = {
  uuid: string
  queuedAt: Date
  startedAt?: Date
  endedAt?: Date
  caption?: string
  log?: DocumentLogWithMetadataAndError
}

export type ActiveRun = Pick<Run, 'uuid' | 'queuedAt' | 'startedAt' | 'caption'>
export type CompletedRun = Required<Run>

export const RUN_CAPTION_SIZE = 150

export const ACTIVE_RUNS_CACHE_KEY = (workspaceId: number, projectId: number) =>
  `runs:active:${workspaceId}:${projectId}`

export const ACTIVE_RUN_CACHE_TTL = 1 * 24 * 60 * 60 // 1 day
