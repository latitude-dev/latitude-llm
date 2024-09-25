import { queues } from '@latitude-data/core/queues'
import { Job, JobsOptions, Queue, QueueEvents } from 'bullmq'
import Redis from 'ioredis'

import { Jobs, Queues, QUEUES } from '../constants'
import { JobDefinition } from '../job-definitions'

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
  connection,
}: {
  name: Queues
  jobs: readonly QueueJob[]
  connection: Redis
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

type QueueJob = (typeof QUEUES)[keyof typeof QUEUES]['jobs'][number]

export async function setupQueues() {
  const connection = await queues()
  return Object.entries(QUEUES).reduce<{
    [K in keyof typeof QUEUES]: ReturnType<typeof setupQueue>
  }>(
    (acc, [name, { jobs }]) => {
      return {
        ...acc,
        [name]: setupQueue({ name: name as Queues, jobs, connection }),
      }
    },
    {} as { [K in keyof typeof QUEUES]: ReturnType<typeof setupQueue> },
  )
}
