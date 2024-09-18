import { createProviderLogJob } from '@latitude-data/core/events/handlers/createProviderLogJob'
import { EventHandlers } from '@latitude-data/core/events/handlers/index'

import { runBatchEvaluationJob } from './job-definitions/batchEvaluations/runBatchEvaluationJob'
import { runDocumentJob } from './job-definitions/batchEvaluations/runDocumentJob'
import { runEvaluationJob } from './job-definitions/batchEvaluations/runEvaluationJob'
import { createEventJob } from './job-definitions/events/createEventJob'
import { publishEventJob } from './job-definitions/events/publishEventJob'

// TODO: Review if we can remove this declarations
export enum Queues {
  defaultQueue = 'defaultQueue',
  eventsQueue = 'eventsQueue',
  eventHandlersQueue = 'eventHandlersQueue',
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
      runBatchEvaluationJob,
      runDocumentJob,
      runEvaluationJob,
      createProviderLogJob,
    ],
  },
  [Queues.eventsQueue]: {
    name: Queues.eventsQueue,
    jobs: [publishEventJob, createEventJob],
  },
  [Queues.eventHandlersQueue]: {
    name: Queues.eventHandlersQueue,
    jobs: Object.values(EventHandlers).flat(),
  },
} as const
