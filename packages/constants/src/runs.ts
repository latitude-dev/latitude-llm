import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  ManualEvaluationMetric,
} from './evaluations'
import { DocumentLogWithMetadataAndError, LogSources } from './models'

export type RunAnnotation<
  T extends EvaluationType = EvaluationType,
  M extends ManualEvaluationMetric<T> = ManualEvaluationMetric<T>,
> = {
  result: EvaluationResultV2<T, M>
  evaluation: EvaluationV2<T, M>
}

export type Run = {
  uuid: string
  queuedAt: Date
  startedAt?: Date
  endedAt?: Date
  caption?: string
  log?: DocumentLogWithMetadataAndError
  annotations?: RunAnnotation[]
  source?: LogSources
}

export type ActiveRun = Pick<
  Run,
  'uuid' | 'queuedAt' | 'startedAt' | 'caption' | 'source'
>
export type CompletedRun = Required<Run>

export const RUN_CAPTION_SIZE = 150

export const ACTIVE_RUNS_CACHE_KEY = (workspaceId: number, projectId: number) =>
  `runs:active:${workspaceId}:${projectId}`
export const ACTIVE_RUN_CACHE_TTL = 1 * 3 * 60 * 60 * 1000 // 3 hours
export const ACTIVE_RUN_CACHE_TTL_SECONDS = Math.floor(
  ACTIVE_RUN_CACHE_TTL / 1000,
)

export const ACTIVE_RUN_STREAM_KEY = (runUuid: string) =>
  `run:active:${runUuid}:stream`
export const ACTIVE_RUN_STREAM_CAP = 100_000

export enum RunSourceGroup {
  Production = 'production',
  Playground = 'playground',
}

export const RUN_SOURCES: Record<RunSourceGroup, LogSources[]> = {
  [RunSourceGroup.Production]: [
    LogSources.API,
    LogSources.Copilot,
    LogSources.EmailTrigger,
    LogSources.IntegrationTrigger,
    LogSources.ScheduledTrigger,
    LogSources.SharedPrompt,
    LogSources.User,
  ],
  [RunSourceGroup.Playground]: [LogSources.Playground, LogSources.Experiment],
} as const
