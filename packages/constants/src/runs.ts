import {
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  ManualEvaluationMetric,
} from './evaluations'
import { DocumentLogWithMetadataAndError } from './models'

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
}

export type ActiveRun = Pick<Run, 'uuid' | 'queuedAt' | 'startedAt' | 'caption'>
export type CompletedRun = Required<Run>

export const RUN_CAPTION_SIZE = 150

export const ACTIVE_RUNS_CACHE_KEY = (workspaceId: number, projectId: number) =>
  `runs:active:${workspaceId}:${projectId}`
export const ACTIVE_RUN_CACHE_TTL = 1 * 24 * 60 * 60 // 1 day

export const ACTIVE_RUN_STREAM_KEY = (runUuid: string) =>
  `run:active:${runUuid}:stream`
export const ACTIVE_RUN_STREAM_TTL = 2 * 60 * 60 // 2 hours
export const ACTIVE_RUN_STREAM_CAP = 100_000
