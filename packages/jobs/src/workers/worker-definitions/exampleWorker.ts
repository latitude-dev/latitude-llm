import { Queues } from '$jobs/constants'
import { ExampleJobData } from '$jobs/job-definitions'
import { Job, Processor } from 'bullmq'

type ExampleResult = { job: Job; patata: string }
const processor: Processor<ExampleJobData, ExampleResult> = async (job) => {
  const { patata } = job.data

  await new Promise((resolve) => setTimeout(resolve, 5000))

  console.log('Running run', job.id, patata)
  return { job, patata }
}

export default {
  processor,
  queueName: Queues.exampleQueue,
}
