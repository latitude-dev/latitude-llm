import {
  Job,
  JobSchedulerTemplateOptions,
  JobsOptions,
  Queue,
  QueueEvents,
} from 'bullmq'
import Redis from 'ioredis'

import { queuesConnection } from '../../queues'
import { Jobs, Queues, QUEUES } from '../constants'
import { JobDefinition } from '../job-definitions/types'
import { env } from '@latitude-data/env'

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

type ScheduleFunctionName<T extends string> = `schedule${Capitalize<T>}`
type JobScheduleFn = {
  [P in ScheduleFunctionName<keyof typeof Jobs>]: (
    cron: string,
    options?: JobSchedulerTemplateOptions,
  ) => Promise<Job<JobDefinition[Queues][Jobs]['data']>>
}

const attempts = env.JOB_RETRY_ATTEMPTS

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

  const jobz = jobs.reduce(
    (acc, job) => ({
      ...acc,
      [`enqueue${capitalize(job)}` as EnqueueFunctionName<typeof job>]: (
        params: JobDefinition[typeof name][Jobs]['data'],
        options: JobsOptions,
      ) => queue.add(job, params, options),
      [`schedule${capitalize(job)}` as ScheduleFunctionName<typeof job>]: (
        cron: string,
        options: JobSchedulerTemplateOptions,
      ) => queue.upsertJobScheduler(job, { pattern: cron }, { opts: options }),
    }),
    {} as JobEnqueueFn & JobScheduleFn,
  )

  return {
    queue,
    events: new QueueEvents(name, { connection }),
    jobs: jobz,
  }
}

let queues: Awaited<ReturnType<typeof setupQueues>> | undefined

export async function setupQueues(): Promise<
  Record<keyof typeof QUEUES, ReturnType<typeof setupQueue>>
> {
  if (queues) return queues
  const connection = await queuesConnection()

  queues = Object.entries(QUEUES).reduce<{
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

  return queues
}
