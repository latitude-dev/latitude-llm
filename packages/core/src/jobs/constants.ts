import { EventHandlers } from '../events/handlers'
import { createProviderLogJob } from '../events/handlers/createProviderLogJob'
import { runBatchEvaluationJob } from './job-definitions/batchEvaluations/runBatchEvaluationJob'
import { runDocumentForEvaluationJob } from './job-definitions/batchEvaluations/runDocumentJob'
import { runEvaluationJob } from './job-definitions/batchEvaluations/runEvaluationJob'
import { runDocumentInBatchJob } from './job-definitions/documents/runDocumentInBatchJob'
import { runDocumentJob } from './job-definitions/documents/runDocumentJob'
import { createEventJob } from './job-definitions/events/createEventJob'
import { publishEventJob } from './job-definitions/events/publishEventJob'
import { publishToAnalyticsJob } from './job-definitions/events/publishToAnalyticsJob'
import { runLiveEvaluationJob } from './job-definitions/liveEvaluations/runLiveEvaluationJob'

// TODO: Review if we can remove this declarations
export enum Queues {
  defaultQueue = 'defaultQueue',
  eventsQueue = 'eventsQueue',
  eventHandlersQueue = 'eventHandlersQueue',
  liveEvaluationsQueue = 'liveEvaluationsQueue',
}

// TODO: Review if we can remove this declarations
export enum Jobs {
  createProviderLogJob = 'createProviderLogJob',
  createDocumentLogJob = 'createDocumentLogJob',
  createEventJob = 'createEventJob',
  publishEventJob = 'publishEventJob',
}

export const QUEUES = {
  [Queues.defaultQueue]: {
    name: Queues.defaultQueue,
    jobs: [
      createProviderLogJob,
      runBatchEvaluationJob,
      runDocumentForEvaluationJob,
      runDocumentInBatchJob,
      runDocumentJob,
      runEvaluationJob,
    ],
  },
  [Queues.eventsQueue]: {
    name: Queues.eventsQueue,
    jobs: [publishEventJob, createEventJob, publishToAnalyticsJob],
  },
  [Queues.eventHandlersQueue]: {
    name: Queues.eventHandlersQueue,
    jobs: Object.values(EventHandlers).flat(),
  },
  [Queues.liveEvaluationsQueue]: {
    name: Queues.liveEvaluationsQueue,
    jobs: [runLiveEvaluationJob],
  },
} as const
