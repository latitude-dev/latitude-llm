import { Job, JobsOptions, Queue, QueueEvents } from 'bullmq'
import Redis from 'ioredis'

import { queues } from '../../queues'
import { Jobs, Queues, QUEUES } from '../constants'
import { JobDefinition } from '../job-definitions/types'

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
  removeOnFail: true,
  removeOnComplete: true,
}

function setupQueue({
  name,
  jobs,
  connection,
}: {
  name: Queues
  jobs: readonly string[]
  connection: Redis
}) {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
  const jobz = jobs.reduce((acc, job) => {
    const key = `enqueue${capitalize(job)}` as EnqueueFunctionName<typeof job>
    const enqueueFn = (
      params: JobDefinition[typeof name][Jobs]['data'],
      options: JobsOptions,
    ) => queue.add(job, params, options)

    return { ...acc, [key]: enqueueFn }
  }, {} as JobEnqueueFn)

  return {
    queue,
    events: new QueueEvents(name, { connection }),
    jobs: jobz,
  }
}

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
