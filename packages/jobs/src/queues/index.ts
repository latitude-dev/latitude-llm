import { Jobs, Queues } from '$jobs/constants'
import { JobDefinition } from '$jobs/job-definitions'
import { Job, JobsOptions, Queue, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'

function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

type EnqueueFunctionName<T extends string> = `enqueue${Capitalize<T>}`

type JobEnqueueFn = {
  [P in EnqueueFunctionName<keyof typeof Jobs>]: (
    params: JobDefinition[Queues][Jobs]['data'],
    options?: JobsOptions,
  ) => Promise<Job<JobDefinition[Queues][Jobs]['data']>>
}

function setupQueue({
  name,
  connection,
  jobs,
}: {
  name: Queues
  connection: Redis
  jobs: Jobs[]
}) {
  const queue = new Queue(name, { connection })
  return {
    events: new QueueEvents(name, { connection }),
    jobs: jobs.reduce((acc, jobName) => {
      const key = `enqueue${capitalize(jobName)}`
      const enqueuFn = (
        params: JobDefinition[typeof name][typeof jobName]['data'],
        options?: JobsOptions,
      ) => {
        return queue.add(jobName, params, options)
      }
      return { ...acc, [key]: enqueuFn }
    }, {} as JobEnqueueFn),
  }
}

export function setupQueues({ connection }: { connection: Redis }) {
  return {
    [Queues.defaultQueue]: setupQueue({
      connection,
      name: Queues.defaultQueue,
      jobs: [Jobs.createProviderLogJob, Jobs.createDocumentLogJob],
    }),
  }
}
