import type { ExperimentDto } from '@latitude-data/core/browser'

type ExperimentStatus = {
  isPending: boolean
  isRunning: boolean
  isFinished: boolean
}

export function getStatus(experiment: ExperimentDto): ExperimentStatus {
  return {
    isPending: !experiment.startedAt,
    isRunning: !!experiment.startedAt && !experiment.finishedAt,
    isFinished: !!experiment.finishedAt,
  }
}
