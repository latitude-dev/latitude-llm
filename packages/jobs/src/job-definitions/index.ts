import { Jobs, Queues } from '$jobs/constants'

export type ExampleJobData = { patata: string }

type JobData<J extends Jobs> = J extends Jobs.exampleJob
  ? ExampleJobData
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [Queues.exampleQueue]: {
    [Jobs.exampleJob]: JobSpec<Jobs.exampleJob>
  }
}
