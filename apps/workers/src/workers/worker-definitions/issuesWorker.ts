import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  generateIssueDetailsJob: jobs.generateIssueDetailsJob,
  discoverResultIssueJob: jobs.discoverResultIssueJob,
  mergeCommonIssuesJob: jobs.mergeCommonIssuesJob,
}

export function startIssuesWorker() {
  return createWorker(Queues.issuesQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
