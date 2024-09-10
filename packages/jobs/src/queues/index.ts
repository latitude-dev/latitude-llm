import { EventHandlers } from '@latitude-data/core/events/handlers/index'
import { Job, JobsOptions, Queue, QueueEvents } from 'bullmq'

import { Jobs, Queues } from '../constants'
import { createDocumentLogJob, JobDefinition } from '../job-definitions'
import { runBatchEvaluationJob } from '../job-definitions/batchEvaluations/runBatchEvaluationJob'
import { runDocumentJob } from '../job-definitions/batchEvaluations/runDocumentJob'
import { runEvaluationJob } from '../job-definitions/batchEvaluations/runEvaluationJob'
import { createEventJob } from '../job-definitions/events/createEventJob'
import { publishEventJob } from '../job-definitions/events/publishEventJob'
import { connection } from '../utils/connection'

export function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

type EnqueueFunctionName<T extends string> = `enqueue${Capitalize<T>}`

type JobEnqueueFn = {
  [P in EnqueueFunctionName<keyof typeof Jobs>]: (
    params: JobDefinition[Queues][Jobs]['data'],
    options?: JobsOptions,
  ) => Promise<Job<JobDefinition[Queues][Jobs]['data']>>
}

const attempts = process.env.NODE_ENV === 'production' ? 100 : 3

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
}

function setupQueue({
  name,
  jobs,
}: {
  name: Queues
  jobs: readonly QueueJob[]
}) {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
  const jobz = jobs.reduce((acc, job) => {
    const key = `enqueue${capitalize(job.name)}` as EnqueueFunctionName<
      typeof job.name
    >
    const enqueueFn = (
      params: JobDefinition[typeof name][Jobs]['data'],
      options: JobsOptions,
    ) => queue.add(job.name, params, options)

    return { ...acc, [key]: enqueueFn }
  }, {} as JobEnqueueFn)

  return {
    queue,
    events: new QueueEvents(name, { connection }),
    jobs: jobz,
  }
}

export const QUEUES = {
  [Queues.defaultQueue]: {
    name: Queues.defaultQueue,
    jobs: [
      createDocumentLogJob,
      runBatchEvaluationJob,
      runDocumentJob,
      runEvaluationJob,
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

type QueueJob = (typeof QUEUES)[keyof typeof QUEUES]['jobs'][number]

export function setupQueues() {
  return Object.entries(QUEUES).reduce<{
    [K in keyof typeof QUEUES]: ReturnType<typeof setupQueue>
  }>(
    (acc, [name, { jobs }]) => {
      return {
        ...acc,
        [name]: setupQueue({ name: name as Queues, jobs }),
      }
    },
    {} as { [K in keyof typeof QUEUES]: ReturnType<typeof setupQueue> },
  )
}
