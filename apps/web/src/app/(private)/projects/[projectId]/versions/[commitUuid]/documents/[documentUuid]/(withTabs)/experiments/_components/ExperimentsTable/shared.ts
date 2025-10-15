import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'

export type ExperimentStatus = {
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
